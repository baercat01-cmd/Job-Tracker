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
  Briefcase,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Info
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
  const [importing, setImporting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importStats, setImportStats] = useState({ success: 0, failed: 0, skipped: 0 });

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

  async function handleFileImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type - Accept CSV, Excel, or VCF (vCard)
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls', 'vcf'].includes(fileExtension || '')) {
      toast.error('Please upload a CSV, Excel, or vCard file');
      return;
    }

    // Handle CSV files (Thunderbird export)
    if (fileExtension === 'csv') {
      handleCSVImport(file);
      return;
    }

    // Handle vCard files (Thunderbird export)
    if (fileExtension === 'vcf') {
      handleVCardImport(file);
      return;
    }

    setImporting(true);
    try {
      const XLSX = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      if (workbook.SheetNames.length === 0) {
        throw new Error('No sheets found in the Excel file');
      }

      // Get first sheet
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' }) as any[];

      if (jsonData.length === 0) {
        throw new Error('No data found in the Excel file');
      }

      // Map Zoho CRM export fields to our schema - CAPTURE ALL DATA
      const mappedContacts = jsonData.map((row: any) => {
        // Handle name from multiple possible columns
        let contactName = row['Display Name'] || row['Contact Name'] || row['Full Name'] || '';
        
        // If no display name, construct from First + Last Name
        if (!contactName && (row['First Name'] || row['Last Name'])) {
          const firstName = (row['First Name'] || '').trim();
          const lastName = (row['Last Name'] || '').trim();
          contactName = `${firstName} ${lastName}`.trim();
        }
        
        // Store ALL data fields in structured format
        const allData: any[] = [];
        
        // === CUSTOMER/CONTACT INFO ===
        if (row['Customer Number']) allData.push({ section: 'Customer Info', label: 'Customer #', value: row['Customer Number'] });
        if (row['Contact ID']) allData.push({ section: 'Customer Info', label: 'Contact ID', value: row['Contact ID'] });
        if (row['First Name']) allData.push({ section: 'Customer Info', label: 'First Name', value: row['First Name'] });
        if (row['Last Name']) allData.push({ section: 'Customer Info', label: 'Last Name', value: row['Last Name'] });
        if (row['Contact Name'] && row['Contact Name'] !== contactName) {
          allData.push({ section: 'Customer Info', label: 'Contact Name', value: row['Contact Name'] });
        }
        
        // === CONTACT DETAILS ===
        if (row['Mobile Phone']) allData.push({ section: 'Contact Details', label: 'Mobile', value: row['Mobile Phone'] });
        if (row['Email ID']) allData.push({ section: 'Contact Details', label: 'Email', value: row['Email ID'] });
        
        // === ADDRESS INFO ===
        if (row['Billing Address']) allData.push({ section: 'Address', label: 'Street', value: row['Billing Address'] });
        if (row['Billing City']) allData.push({ section: 'Address', label: 'City', value: row['Billing City'] });
        if (row['Billing State']) allData.push({ section: 'Address', label: 'State', value: row['Billing State'] });
        if (row['Billing Code']) allData.push({ section: 'Address', label: 'Zip Code', value: row['Billing Code'] });
        if (row['Contact Address ID']) allData.push({ section: 'Address', label: 'Address ID', value: row['Contact Address ID'] });
        
        // Construct full address
        const addressParts = [
          row['Billing Address'],
          row['Billing City'],
          row['Billing State'],
          row['Billing Code']
        ].filter(Boolean);
        if (addressParts.length > 0) {
          allData.push({ section: 'Address', label: 'Full Address', value: addressParts.join(', ') });
        }
        
        // === TAX INFORMATION ===
        if (row['Taxable']) allData.push({ section: 'Tax Info', label: 'Taxable', value: row['Taxable'] });
        if (row['Tax ID']) allData.push({ section: 'Tax Info', label: 'Tax ID', value: row['Tax ID'] });
        if (row['Tax Name']) allData.push({ section: 'Tax Info', label: 'Tax Name', value: row['Tax Name'] });
        if (row['Tax Percentage']) allData.push({ section: 'Tax Info', label: 'Tax Rate', value: row['Tax Percentage'] + '%' });
        if (row['Exemption Reason']) allData.push({ section: 'Tax Info', label: 'Tax Exemption', value: row['Exemption Reason'] });
        if (row['Tax Authority']) allData.push({ section: 'Tax Info', label: 'Tax Authority', value: row['Tax Authority'] });
        
        // === ADDITIONAL INFO ===
        if (row['Description'] || row['Notes']) {
          allData.push({ section: 'Notes', label: 'Description', value: row['Description'] || row['Notes'] });
        }
        
        // Convert to formatted notes string with sections
        const formattedNotes = allData.length > 0 
          ? formatStructuredNotes(allData)
          : null;
        
        return {
          name: contactName,
          email: row['Email ID'] || row['Email'] || row['Email Address'] || '',
          phone: row['Phone'] || row['Mobile Phone'] || row['Mobile'] || row['Phone Number'] || '',
          category: determineCategory(row),
          company_name: row['Company Name'] || row['Company'] || row['Account Name'] || row['Organization'] || '',
          notes: formattedNotes,
          hasDetailedInfo: allData.length > 0,
        };
      }).filter(c => c.name && c.email); // Only include contacts with name and email

      setImportPreview(mappedContacts);
      setShowImportDialog(true);
      
      toast.success(`Found ${mappedContacts.length} valid contacts to import`);
    } catch (error: any) {
      console.error('Error importing file:', error);
      toast.error('Failed to parse Excel file: ' + error.message);
    } finally {
      setImporting(false);
      // Reset file input
      event.target.value = '';
    }
  }

  // Format structured data into organized notes
  function formatStructuredNotes(dataArray: any[]): string {
    const sections = dataArray.reduce((acc: any, item) => {
      if (!acc[item.section]) acc[item.section] = [];
      acc[item.section].push(`${item.label}: ${item.value}`);
      return acc;
    }, {});
    
    return Object.entries(sections)
      .map(([section, items]: [string, any]) => {
        return `=== ${section} ===\n${items.join('\n')}`;
      })
      .join('\n\n');
  }

  function determineCategory(row: any): 'customer' | 'vendor' | 'subcontractor' {
    // Check multiple possible category fields
    const type = (row['Contact Type'] || row['Type'] || row['Category'] || row['Customer Type'] || '').toLowerCase();
    
    // Check company name for hints
    const companyName = (row['Company Name'] || row['Company'] || '').toLowerCase();
    
    // Determine category based on type field or company name hints
    if (type.includes('vendor') || type.includes('supplier') || companyName.includes('supply')) {
      return 'vendor';
    }
    if (type.includes('sub') || type.includes('contractor') || type.includes('subcontractor')) {
      return 'subcontractor';
    }
    
    // Default to customer for Zoho contacts
    return 'customer';
  }

  async function executeImport() {
    setImporting(true);
    const stats = { success: 0, failed: 0, skipped: 0 };

    try {
      for (const contact of importPreview) {
        try {
          // Remove UI-only fields
          const { hasDetailedInfo, ...contactData } = contact;
          
          // Check if contact already exists by email
          const { data: existing } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', contactData.email)
            .maybeSingle();

          if (existing) {
            stats.skipped++;
            continue;
          }

          // Insert new contact
          const { error } = await supabase
            .from('contacts')
            .insert([{
              ...contactData,
              created_by: profile?.id,
              is_active: true,
            }]);

          if (error) {
            console.error('Error inserting contact:', contactData.email, error);
            stats.failed++;
          } else {
            stats.success++;
          }
        } catch (error) {
          console.error('Error processing contact:', contact.email, error);
          stats.failed++;
        }
      }

      setImportStats(stats);
      toast.success(
        `Import complete! ${stats.success} created, ${stats.skipped} skipped, ${stats.failed} failed`
      );
      
      await loadContacts();
      setShowImportDialog(false);
      setImportPreview([]);
    } catch (error: any) {
      console.error('Error during import:', error);
      toast.error('Import failed: ' + error.message);
    } finally {
      setImporting(false);
    }
  }

  async function handleCSVImport(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n');
      
      if (lines.length < 2) {
        throw new Error('CSV file is empty or invalid');
      }

      // Parse CSV headers
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"/, '').replace(/"$/, ''));
      
      // Parse data rows
      const mappedContacts = lines.slice(1)
        .filter(line => line.trim())
        .map(line => {
          // Simple CSV parser (handles quoted values)
          const values = [];
          let current = '';
          let inQuotes = false;
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              values.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          values.push(current.trim());

          // Map CSV columns to contact fields
          const row: any = {};
          headers.forEach((header, idx) => {
            row[header] = values[idx] || '';
          });

          // Map common Thunderbird/CSV field names
          const name = row['Display Name'] || row['First Name'] || row['Name'] || '';
          const lastName = row['Last Name'] || '';
          const fullName = lastName ? `${name} ${lastName}`.trim() : name;
          
          return {
            name: fullName || row['Email'] || 'Unknown',
            email: row['Email'] || row['Email Address'] || row['Primary Email'] || '',
            phone: row['Phone'] || row['Work Phone'] || row['Mobile Phone'] || row['Home Phone'] || '',
            category: 'customer' as const,
            company_name: row['Company'] || row['Organization'] || row['Company Name'] || '',
            notes: row['Notes'] || '',
          };
        })
        .filter(c => c.email); // Only include contacts with email

      setImportPreview(mappedContacts);
      setShowImportDialog(true);
      
      toast.success(`Found ${mappedContacts.length} valid contacts in CSV`);
    } catch (error: any) {
      console.error('Error importing CSV:', error);
      toast.error('Failed to parse CSV file: ' + error.message);
    } finally {
      setImporting(false);
    }
  }

  async function handleVCardImport(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const vcards = text.split('BEGIN:VCARD').filter(v => v.trim());
      
      const mappedContacts = vcards.map(vcard => {
        const lines = vcard.split('\n');
        const contact: any = {
          name: '',
          email: '',
          phone: '',
          category: 'customer' as const,
          company_name: '',
          notes: '',
        };

        lines.forEach(line => {
          const [field, ...valueParts] = line.split(':');
          const value = valueParts.join(':').trim();
          
          if (field.startsWith('FN')) contact.name = value;
          if (field.startsWith('EMAIL')) contact.email = value;
          if (field.startsWith('TEL')) contact.phone = value;
          if (field.startsWith('ORG')) contact.company_name = value;
          if (field.startsWith('NOTE')) contact.notes = value;
        });

        return contact;
      }).filter(c => c.email);

      setImportPreview(mappedContacts);
      setShowImportDialog(true);
      
      toast.success(`Found ${mappedContacts.length} valid contacts in vCard`);
    } catch (error: any) {
      console.error('Error importing vCard:', error);
      toast.error('Failed to parse vCard file: ' + error.message);
    } finally {
      setImporting(false);
    }
  }

  async function autoCreateFromEmails() {
    setImporting(true);
    try {
      // Get all emails that don't have a matching contact
      const { data: emails, error: emailsError } = await supabase
        .from('job_emails')
        .select('from_email, from_name, entity_category')
        .not('from_email', 'is', null);

      if (emailsError) throw emailsError;

      // Get existing contacts
      const { data: existingContacts, error: contactsError } = await supabase
        .from('contacts')
        .select('email');

      if (contactsError) throw contactsError;

      const existingEmails = new Set(existingContacts?.map(c => c.email.toLowerCase()) || []);

      // Find unique emails that don't have contacts yet
      const uniqueEmails = new Map();
      emails?.forEach(email => {
        const emailLower = email.from_email.toLowerCase();
        if (!existingEmails.has(emailLower) && !uniqueEmails.has(emailLower)) {
          uniqueEmails.set(emailLower, {
            name: email.from_name || email.from_email.split('@')[0],
            email: email.from_email,
            phone: '',
            category: email.entity_category || 'customer',
            company_name: '',
            notes: 'Auto-created from email communications',
          });
        }
      });

      const newContacts = Array.from(uniqueEmails.values());

      if (newContacts.length === 0) {
        toast.info('No new contacts found from emails');
        return;
      }

      setImportPreview(newContacts);
      setShowImportDialog(true);
      
      toast.success(`Found ${newContacts.length} new contacts from emails`);
    } catch (error: any) {
      console.error('Error auto-creating contacts:', error);
      toast.error('Failed to extract contacts from emails');
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const template = [
      {
        'Display Name': 'John Doe',
        'Email': 'john@example.com',
        'Phone': '(555) 123-4567',
        'Company': 'ABC Construction',
        'First Name': 'John',
        'Last Name': 'Doe',
        'Notes': 'Primary contact',
      },
      {
        'Display Name': 'Jane Smith',
        'Email': 'jane@vendor.com',
        'Phone': '(555) 987-6543',
        'Company': 'Supply Co',
        'First Name': 'Jane',
        'Last Name': 'Smith',
        'Notes': 'Material supplier',
      },
    ];

    const csv = [
      Object.keys(template[0]).join(','),
      ...template.map(row => Object.values(row).map(v => `"${v}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
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
          <div className="mt-2 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-3 py-2 max-w-2xl">
            💡 <strong>Import Options:</strong> Upload CSV/Excel from Thunderbird, import vCard files, or auto-create contacts from your synced emails
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={autoCreateFromEmails} disabled={importing}>
            <Mail className="w-4 h-4 mr-2" />
            {importing ? 'Processing...' : 'From Emails'}
          </Button>
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="w-4 h-4 mr-2" />
            Template
          </Button>
          <label htmlFor="contact-import">
            <Button variant="outline" disabled={importing} asChild>
              <span>
                <Upload className="w-4 h-4 mr-2" />
                {importing ? 'Importing...' : 'Import File'}
              </span>
            </Button>
          </label>
          <input
            id="contact-import"
            type="file"
            accept=".csv,.xlsx,.xls,.vcf"
            className="hidden"
            onChange={handleFileImport}
          />
          <Button onClick={() => setShowDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Contact
          </Button>
        </div>
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

      {/* Import Preview Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-blue-600" />
              Import Preview - {importPreview.length} Contacts
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">📊 Import Summary:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Total contacts to import: <strong>{importPreview.length}</strong></li>
                <li>• Customers: <strong>{importPreview.filter(c => c.category === 'customer').length}</strong></li>
                <li>• Vendors: <strong>{importPreview.filter(c => c.category === 'vendor').length}</strong></li>
                <li>• Subcontractors: <strong>{importPreview.filter(c => c.category === 'subcontractor').length}</strong></li>
                <li>• With detailed info: <strong>{importPreview.filter(c => c.hasDetailedInfo).length}</strong></li>
              </ul>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                ⚠️ All data from your Excel file will be preserved in each contact record. Only key fields (name, email, phone, company) are displayed in the main view, but all information is stored and accessible when editing.
              </p>
            </div>

            {/* Preview Table */}
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Name</th>
                      <th className="px-3 py-2 text-left font-semibold">Email</th>
                      <th className="px-3 py-2 text-left font-semibold">Phone</th>
                      <th className="px-3 py-2 text-left font-semibold">Category</th>
                      <th className="px-3 py-2 text-left font-semibold">Company</th>
                      <th className="px-3 py-2 text-center font-semibold">
                        <Info className="w-4 h-4 mx-auto" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 50).map((contact, idx) => (
                      <tr key={idx} className="border-t hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium">{contact.name}</td>
                        <td className="px-3 py-2 text-xs">{contact.email}</td>
                        <td className="px-3 py-2 text-xs">{contact.phone || '-'}</td>
                        <td className="px-3 py-2">
                          <Badge className="text-xs">{contact.category}</Badge>
                        </td>
                        <td className="px-3 py-2 text-xs">{contact.company_name || '-'}</td>
                        <td className="px-3 py-2 text-center">
                          {contact.hasDetailedInfo && (
                            <CheckCircle className="w-4 h-4 text-green-600 mx-auto" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importPreview.length > 50 && (
                <div className="bg-slate-50 border-t px-3 py-2 text-sm text-slate-600">
                  Showing first 50 of {importPreview.length} contacts
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button 
                onClick={executeImport} 
                disabled={importing}
                className="flex-1"
              >
                {importing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Importing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Import {importPreview.length} Contacts
                  </>
                )}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowImportDialog(false);
                  setImportPreview([]);
                }}
                disabled={importing}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                <Select value={jobId || undefined} onValueChange={(value) => setJobId(value || '')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select job (or leave blank)..." />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.job_number ? `#${job.job_number} - ` : ''}{job.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {jobId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setJobId('')}
                    className="mt-1 text-xs h-6"
                  >
                    Clear Selection
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={5}
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
        <Card key={contact.id} className="hover:shadow-lg transition-shadow">
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
                  <div className="mt-3 pt-3 border-t">
                    <details className="cursor-pointer">
                      <summary className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        View All Information
                      </summary>
                      <div className="mt-2 text-xs text-muted-foreground space-y-2 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded">
                        {contact.notes.split('\n').map((line, i) => {
                          // Highlight section headers
                          if (line.startsWith('===')) {
                            return (
                              <p key={i} className="font-bold text-slate-700 mt-2">
                                {line.replace(/=/g, '').trim()}
                              </p>
                            );
                          }
                          return <p key={i} className="leading-relaxed">{line}</p>;
                        })}
                      </div>
                    </details>
                  </div>
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
