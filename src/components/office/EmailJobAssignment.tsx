import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, Mail, Link as LinkIcon, CheckCircle, AlertCircle, Calendar, User, Briefcase, X } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';

interface JobEmail {
  id: string;
  job_id: string | null;
  contact_id: string | null;
  subject: string;
  from_email: string;
  from_name: string | null;
  to_emails: any;
  email_date: string;
  body_text: string | null;
  body_html: string | null;
  direction: 'inbound' | 'outbound';
  entity_category: string | null;
}

interface Job {
  id: string;
  job_number: string | null;
  name: string;
  client_name: string;
  status: string;
}

interface Contact {
  id: string;
  name: string;
  email: string;
  category: string;
  job_id: string | null;
}

interface SuggestedMatch {
  emailId: string;
  jobId: string;
  jobName: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

export function EmailJobAssignment() {
  const [emails, setEmails] = useState<JobEmail[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'assigned' | 'unassigned'>('unassigned');
  const [selectedEmail, setSelectedEmail] = useState<JobEmail | null>(null);
  const [selectedJob, setSelectedJob] = useState<string | undefined>(undefined);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedMatch[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [bulkAssignJob, setBulkAssignJob] = useState<string | undefined>(undefined);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (emails.length > 0 && jobs.length > 0 && contacts.length > 0) {
      generateSuggestions();
    }
  }, [emails, jobs, contacts]);

  async function loadData() {
    try {
      setLoading(true);

      // Load all emails
      const { data: emailsData, error: emailsError } = await supabase
        .from('job_emails')
        .select('*')
        .order('email_date', { ascending: false });

      if (emailsError) throw emailsError;

      // Load all active jobs
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('id, job_number, name, client_name, status')
        .in('status', ['active', 'prepping', 'quoting'])
        .order('name');

      if (jobsError) throw jobsError;

      // Load all contacts
      const { data: contactsData, error: contactsError } = await supabase
        .from('contacts')
        .select('*')
        .order('name');

      if (contactsError) throw contactsError;

      setEmails(emailsData || []);
      setJobs(jobsData || []);
      setContacts(contactsData || []);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  function generateSuggestions() {
    const newSuggestions: SuggestedMatch[] = [];

    // For each unassigned email
    emails.filter(e => !e.job_id).forEach(email => {
      // Check if sender email matches any contact
      const matchingContacts = contacts.filter(c => 
        c.email.toLowerCase() === email.from_email.toLowerCase() && c.job_id
      );

      matchingContacts.forEach(contact => {
        const job = jobs.find(j => j.id === contact.job_id);
        if (job) {
          newSuggestions.push({
            emailId: email.id,
            jobId: job.id,
            jobName: job.name,
            reason: `Sender (${email.from_email}) matches contact "${contact.name}" for this job`,
            confidence: 'high',
          });
        }
      });

      // Check if job name or client name appears in subject or body
      jobs.forEach(job => {
        const searchText = `${email.subject} ${email.body_text || ''}`.toLowerCase();
        const jobName = job.name.toLowerCase();
        const clientName = job.client_name.toLowerCase();

        if (searchText.includes(jobName) && jobName.length > 3) {
          newSuggestions.push({
            emailId: email.id,
            jobId: job.id,
            jobName: job.name,
            reason: `Job name "${job.name}" appears in email content`,
            confidence: 'medium',
          });
        } else if (searchText.includes(clientName) && clientName.length > 3) {
          newSuggestions.push({
            emailId: email.id,
            jobId: job.id,
            jobName: job.name,
            reason: `Client name "${job.client_name}" appears in email content`,
            confidence: 'medium',
          });
        }
      });
    });

    setSuggestions(newSuggestions);
  }

  async function assignEmailToJob(emailId: string, jobId: string, contactId?: string) {
    try {
      const updateData: any = { 
        job_id: jobId,
        updated_at: new Date().toISOString(),
      };

      if (contactId) {
        updateData.contact_id = contactId;
      }

      const { error } = await supabase
        .from('job_emails')
        .update(updateData)
        .eq('id', emailId);

      if (error) throw error;

      toast.success('Email assigned to job successfully');
      loadData();
      setShowAssignDialog(false);
      setSelectedEmail(null);
      setSelectedJob(undefined);
    } catch (error: any) {
      console.error('Error assigning email:', error);
      toast.error('Failed to assign email to job');
    }
  }

  async function bulkAssignEmails() {
    if (!bulkAssignJob || selectedEmails.size === 0) {
      toast.error('Please select a job and at least one email');
      return;
    }

    try {
      const updates = Array.from(selectedEmails).map(emailId => 
        supabase
          .from('job_emails')
          .update({ 
            job_id: bulkAssignJob,
            updated_at: new Date().toISOString(),
          })
          .eq('id', emailId)
      );

      await Promise.all(updates);

      toast.success(`${selectedEmails.size} emails assigned to job`);
      setSelectedEmails(new Set());
      setBulkAssignJob(undefined);
      loadData();
    } catch (error: any) {
      console.error('Error bulk assigning emails:', error);
      toast.error('Failed to assign emails');
    }
  }

  async function acceptSuggestion(suggestion: SuggestedMatch) {
    await assignEmailToJob(suggestion.emailId, suggestion.jobId);
    // Remove this suggestion after accepting
    setSuggestions(prev => prev.filter(s => s.emailId !== suggestion.emailId));
  }

  async function unassignEmail(emailId: string) {
    try {
      const { error } = await supabase
        .from('job_emails')
        .update({ 
          job_id: null,
          contact_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', emailId);

      if (error) throw error;

      toast.success('Email unassigned from job');
      loadData();
    } catch (error: any) {
      console.error('Error unassigning email:', error);
      toast.error('Failed to unassign email');
    }
  }

  const filteredEmails = emails.filter(email => {
    // Filter by assignment status
    if (filterStatus === 'assigned' && !email.job_id) return false;
    if (filterStatus === 'unassigned' && email.job_id) return false;

    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        email.subject.toLowerCase().includes(search) ||
        email.from_email.toLowerCase().includes(search) ||
        (email.from_name && email.from_name.toLowerCase().includes(search))
      );
    }

    return true;
  });

  const toggleEmailSelection = (emailId: string) => {
    setSelectedEmails(prev => {
      const newSet = new Set(prev);
      if (newSet.has(emailId)) {
        newSet.delete(emailId);
      } else {
        newSet.add(emailId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Loading emails...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-black to-slate-900 text-white rounded-lg p-6 shadow-lg border-2 border-yellow-500">
        <h2 className="text-2xl font-bold tracking-tight">Email to Job Assignment Workflow</h2>
        <p className="text-yellow-400 mt-2">
          Review and connect past emails with your active jobs
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Emails</p>
                <p className="text-2xl font-bold">{emails.length}</p>
              </div>
              <Mail className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Unassigned</p>
                <p className="text-2xl font-bold text-orange-600">
                  {emails.filter(e => !e.job_id).length}
                </p>
              </div>
              <AlertCircle className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Assigned</p>
                <p className="text-2xl font-bold text-green-600">
                  {emails.filter(e => e.job_id).length}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Suggestions</p>
                <p className="text-2xl font-bold text-purple-600">
                  {suggestions.length}
                </p>
              </div>
              <LinkIcon className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="review" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="review">
            <Mail className="w-4 h-4 mr-2" />
            Review & Assign
          </TabsTrigger>
          <TabsTrigger value="suggestions">
            <LinkIcon className="w-4 h-4 mr-2" />
            Smart Suggestions ({suggestions.length})
          </TabsTrigger>
        </TabsList>

        {/* Review & Assign Tab */}
        <TabsContent value="review" className="space-y-4">
          {/* Filters and Search */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by subject, sender, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Emails</SelectItem>
                <SelectItem value="unassigned">Unassigned Only</SelectItem>
                <SelectItem value="assigned">Assigned Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Bulk Actions */}
          {selectedEmails.size > 0 && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900">
                      {selectedEmails.size} email{selectedEmails.size !== 1 ? 's' : ''} selected
                    </p>
                  </div>
                  <Select value={bulkAssignJob || ''} onValueChange={(value) => setBulkAssignJob(value || undefined)}>
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Select job..." />
                    </SelectTrigger>
                    <SelectContent>
                      {jobs.map(job => (
                        <SelectItem key={job.id} value={job.id}>
                          {job.job_number ? `#${job.job_number} - ` : ''}{job.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={bulkAssignEmails}>
                    <LinkIcon className="w-4 h-4 mr-2" />
                    Assign Selected
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedEmails(new Set())}>
                    <X className="w-4 h-4 mr-2" />
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Email List */}
          <div className="space-y-2">
            {filteredEmails.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Mail className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">
                    {filterStatus === 'unassigned' ? 'All emails are assigned!' : 'No emails found'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {searchTerm ? 'Try adjusting your search' : 'Change the filter to view different emails'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredEmails.map(email => {
                const assignedJob = email.job_id ? jobs.find(j => j.id === email.job_id) : null;
                const matchingSuggestion = suggestions.find(s => s.emailId === email.id);

                return (
                  <Card key={email.id} className={`${matchingSuggestion ? 'border-purple-300 bg-purple-50' : ''}`}>
                    <CardContent className="py-4">
                      <div className="flex items-start gap-4">
                        {/* Checkbox for bulk selection */}
                        {!email.job_id && (
                          <Checkbox
                            checked={selectedEmails.has(email.id)}
                            onCheckedChange={() => toggleEmailSelection(email.id)}
                            className="mt-1"
                          />
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-lg truncate">{email.subject}</h3>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                <User className="w-3 h-3" />
                                <span>{email.from_name || email.from_email}</span>
                                <span className="text-xs text-muted-foreground">
                                  {email.from_email !== (email.from_name || email.from_email) && `(${email.from_email})`}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                <Calendar className="w-3 h-3" />
                                <span>{new Date(email.email_date).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric', 
                                  year: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit'
                                })}</span>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              <Badge variant={email.direction === 'inbound' ? 'default' : 'secondary'}>
                                {email.direction === 'inbound' ? 'Received' : 'Sent'}
                              </Badge>
                              {assignedJob && (
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                                    <Briefcase className="w-3 h-3 mr-1" />
                                    {assignedJob.job_number ? `#${assignedJob.job_number}` : assignedJob.name}
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => unassignEmail(email.id)}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Email preview */}
                          {email.body_text && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                              {email.body_text}
                            </p>
                          )}

                          {/* Suggestion badge */}
                          {matchingSuggestion && (
                            <div className="mt-3 p-3 bg-purple-100 border border-purple-300 rounded-lg">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-purple-900">
                                    Suggested: {matchingSuggestion.jobName}
                                  </p>
                                  <p className="text-xs text-purple-700 mt-1">
                                    {matchingSuggestion.reason}
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => acceptSuggestion(matchingSuggestion)}
                                  className="bg-purple-600 hover:bg-purple-700"
                                >
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Accept
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Action Buttons */}
                          {!email.job_id && (
                            <div className="mt-3">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedEmail(email);
                                  setShowAssignDialog(true);
                                }}
                              >
                                <LinkIcon className="w-3 h-3 mr-2" />
                                Assign to Job
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* Smart Suggestions Tab */}
        <TabsContent value="suggestions" className="space-y-4">
          {suggestions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <LinkIcon className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No suggestions available</p>
                <p className="text-sm text-muted-foreground mt-2">
                  All emails are either assigned or don't have clear job matches
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {/* Group by email */}
              {Array.from(new Set(suggestions.map(s => s.emailId))).map(emailId => {
                const email = emails.find(e => e.id === emailId);
                const emailSuggestions = suggestions.filter(s => s.emailId === emailId);
                
                if (!email) return null;

                return (
                  <Card key={emailId} className="border-purple-300 bg-purple-50">
                    <CardContent className="py-4">
                      <div className="space-y-4">
                        {/* Email Info */}
                        <div>
                          <h3 className="font-semibold text-lg">{email.subject}</h3>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                            <User className="w-3 h-3" />
                            <span>{email.from_name || email.from_email}</span>
                            <Calendar className="w-3 h-3 ml-2" />
                            <span>{new Date(email.email_date).toLocaleDateString()}</span>
                          </div>
                        </div>

                        {/* Suggestions */}
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-purple-900">
                            Suggested Jobs ({emailSuggestions.length}):
                          </p>
                          {emailSuggestions.map((suggestion, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-white border border-purple-200 rounded-lg">
                              <div className="flex-1">
                                <p className="font-medium">{suggestion.jobName}</p>
                                <p className="text-xs text-muted-foreground mt-1">{suggestion.reason}</p>
                                <Badge 
                                  variant="outline" 
                                  className={`mt-2 ${
                                    suggestion.confidence === 'high' ? 'bg-green-50 text-green-700 border-green-300' :
                                    suggestion.confidence === 'medium' ? 'bg-yellow-50 text-yellow-700 border-yellow-300' :
                                    'bg-gray-50 text-gray-700 border-gray-300'
                                  }`}
                                >
                                  {suggestion.confidence} confidence
                                </Badge>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => acceptSuggestion(suggestion)}
                                className="bg-purple-600 hover:bg-purple-700"
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Accept
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Assign Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign Email to Job</DialogTitle>
            <DialogDescription>
              Connect this email with a job for better organization
            </DialogDescription>
          </DialogHeader>

          {selectedEmail && (
            <div className="space-y-4">
              {/* Email Preview */}
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Subject</Label>
                      <p className="font-medium">{selectedEmail.subject}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">From</Label>
                      <p className="text-sm">{selectedEmail.from_name || selectedEmail.from_email}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Date</Label>
                      <p className="text-sm">
                        {new Date(selectedEmail.email_date).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Job Selection */}
              <div className="space-y-2">
                <Label>Select Job</Label>
                <Select value={selectedJob || ''} onValueChange={(value) => setSelectedJob(value || undefined)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a job..." />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map(job => (
                      <SelectItem key={job.id} value={job.id}>
                        <div className="flex items-center gap-2">
                          {job.job_number && (
                            <Badge variant="outline" className="text-xs">
                              #{job.job_number}
                            </Badge>
                          )}
                          <span>{job.name}</span>
                          <span className="text-xs text-muted-foreground">
                            - {job.client_name}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Check for matching contacts */}
              {selectedJob && (() => {
                const matchingContact = contacts.find(c => 
                  c.job_id === selectedJob && 
                  c.email.toLowerCase() === selectedEmail.from_email.toLowerCase()
                );

                return matchingContact && (
                  <Card className="border-green-200 bg-green-50">
                    <CardContent className="py-3">
                      <p className="text-sm text-green-900">
                        ✓ This sender ({selectedEmail.from_email}) matches contact "{matchingContact.name}" for this job
                      </p>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Action Buttons */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (!selectedJob) {
                      toast.error('Please select a job');
                      return;
                    }
                    const matchingContact = contacts.find(c => 
                      c.job_id === selectedJob && 
                      c.email.toLowerCase() === selectedEmail.from_email.toLowerCase()
                    );
                    assignEmailToJob(selectedEmail.id, selectedJob, matchingContact?.id);
                  }}
                  disabled={!selectedJob}
                >
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Assign to Job
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
