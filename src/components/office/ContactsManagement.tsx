import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { 
  Plus, 
  Trash2, 
  Edit, 
  User, 
  Building2,
  Mail,
  Phone,
  Briefcase
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

interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  category: 'customer' | 'vendor' | 'subcontractor';
  company_name: string | null;
  job_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  jobs?: any;
}

export function ContactsManagement() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState<'customer' | 'vendor' | 'subcontractor'>('customer');
  const [companyName, setCompanyName] = useState('');
  const [jobId, setJobId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      await Promise.all([loadContacts(), loadJobs()]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadContacts() {
    const { data, error } = await supabase
      .from('contacts')
      .select(`
        *,
        jobs(id, name, job_number)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    setContacts(data || []);
  }

  async function loadJobs() {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, name, job_number, client_name')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;
    setJobs(data || []);
  }

  async function saveContact() {
    if (!name || !email || !category) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const contactData = {
        name,
        email,
        phone: phone || null,
        category,
        company_name: companyName || null,
        job_id: jobId || null,
        notes: notes || null,
        created_by: profile?.id,
      };

      if (editingContact) {
        const { error } = await supabase
          .from('contacts')
          .update(contactData)
          .eq('id', editingContact.id);

        if (error) throw error;
        toast.success('Contact updated successfully');
      } else {
        const { error } = await supabase
          .from('contacts')
          .insert([contactData]);

        if (error) throw error;
        toast.success('Contact created successfully');
      }

      setShowDialog(false);
      resetForm();
      await loadContacts();
    } catch (error: any) {
      console.error('Error saving contact:', error);
      toast.error('Failed to save contact: ' + error.message);
    }
  }

  async function deleteContact(contactId: string) {
    if (!confirm('Delete this contact?')) return;

    try {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', contactId);

      if (error) throw error;
      toast.success('Contact deleted');
      await loadContacts();
    } catch (error: any) {
      console.error('Error deleting contact:', error);
      toast.error('Failed to delete contact');
    }
  }

  function openEditDialog(contact: Contact) {
    setEditingContact(contact);
    setName(contact.name);
    setEmail(contact.email);
    setPhone(contact.phone || '');
    setCategory(contact.category);
    setCompanyName(contact.company_name || '');
    setJobId(contact.job_id || '');
    setNotes(contact.notes || '');
    setShowDialog(true);
  }

  function resetForm() {
    setEditingContact(null);
    setName('');
    setEmail('');
    setPhone('');
    setCategory('customer');
    setCompanyName('');
    setJobId('');
    setNotes('');
  }

  const customerContacts = contacts.filter(c => c.category === 'customer');
  const vendorContacts = contacts.filter(c => c.category === 'vendor');
  const subcontractorContacts = contacts.filter(c => c.category === 'subcontractor');

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'customer': return 'bg-green-100 text-green-800 border-green-300';
      case 'vendor': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'subcontractor': return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading contacts...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Contact Management</h3>
          <p className="text-sm text-muted-foreground">
            Manage customers, vendors, and subcontractors for email categorization
          </p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Contact
        </Button>
      </div>

      <Tabs defaultValue="all">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">
            All ({contacts.length})
          </TabsTrigger>
          <TabsTrigger value="customers">
            <span className="flex items-center gap-2">
              Customers ({customerContacts.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="vendors">
            <span className="flex items-center gap-2">
              Vendors ({vendorContacts.length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="subcontractors">
            <span className="flex items-center gap-2">
              Subcontractors ({subcontractorContacts.length})
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <ContactList contacts={contacts} onEdit={openEditDialog} onDelete={deleteContact} getCategoryColor={getCategoryColor} />
        </TabsContent>

        <TabsContent value="customers" className="mt-4">
          <ContactList contacts={customerContacts} onEdit={openEditDialog} onDelete={deleteContact} getCategoryColor={getCategoryColor} />
        </TabsContent>

        <TabsContent value="vendors" className="mt-4">
          <ContactList contacts={vendorContacts} onEdit={openEditDialog} onDelete={deleteContact} getCategoryColor={getCategoryColor} />
        </TabsContent>

        <TabsContent value="subcontractors" className="mt-4">
          <ContactList contacts={subcontractorContacts} onEdit={openEditDialog} onDelete={deleteContact} getCategoryColor={getCategoryColor} />
        </TabsContent>
      </Tabs>

      {/* Contact Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => {
        setShowDialog(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingContact ? 'Edit Contact' : 'Add New Contact'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                />
              </div>
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@example.com"
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
              <div>
                <Label>Category *</Label>
                <Select value={category} onValueChange={(value: any) => setCategory(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="vendor">Vendor</SelectItem>
                    <SelectItem value="subcontractor">Sub-Contractor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Company Name</Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Company Name"
                />
              </div>
              <div>
                <Label>Linked Job (Optional)</Label>
                <Select value={jobId} onValueChange={setJobId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select job..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {jobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.job_number ? `#${job.job_number} - ` : ''}{job.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={saveContact} className="flex-1">
                {editingContact ? 'Update Contact' : 'Create Contact'}
              </Button>
              <Button variant="outline" onClick={() => {
                setShowDialog(false);
                resetForm();
              }}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Contact List Component
function ContactList({ contacts, onEdit, onDelete, getCategoryColor }: any) {
  if (contacts.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No contacts in this category</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {contacts.map((contact: Contact) => (
        <Card key={contact.id}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-bold text-lg">{contact.name}</h3>
                  <Badge className={getCategoryColor(contact.category)}>
                    {contact.category}
                  </Badge>
                </div>
                
                {contact.company_name && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                    <Building2 className="w-3 h-3" />
                    {contact.company_name}
                  </p>
                )}
                
                <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                  <Mail className="w-3 h-3" />
                  {contact.email}
                </p>
                
                {contact.phone && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {contact.phone}
                  </p>
                )}

                {contact.jobs && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-2">
                    <Briefcase className="w-3 h-3" />
                    {contact.jobs.job_number ? `#${contact.jobs.job_number} - ` : ''}{contact.jobs.name}
                  </p>
                )}

                {contact.notes && (
                  <p className="text-sm text-muted-foreground mt-2 italic">
                    {contact.notes}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEdit(contact)}
                className="flex-1"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDelete(contact.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
