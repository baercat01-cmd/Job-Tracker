import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  RefreshCw,
  Package,
  Users,
  Building2,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Search,
  X,
  ArrowUpDown,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';

interface Material {
  sku: string;
  material_name: string;
  category: string | null;
  unit_price: number | null;
  purchase_cost: number | null;
  part_length: string | null;
  created_at: string;
  updated_at: string;
}

interface Vendor {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company_name: string | null;
  created_at: string;
}

export function ZohoDataManagement() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('materials');

  useEffect(() => {
    loadData();
    loadSyncStatus();

    // Subscribe to changes
    const materialsChannel = supabase
      .channel('materials_catalog_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'materials_catalog' },
        () => loadMaterials()
      )
      .subscribe();

    const vendorsChannel = supabase
      .channel('vendors_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'vendors' },
        () => loadVendors()
      )
      .subscribe();

    const contactsChannel = supabase
      .channel('contacts_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'contacts', filter: 'category=eq.customer' },
        () => loadCustomers()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(materialsChannel);
      supabase.removeChannel(vendorsChannel);
      supabase.removeChannel(contactsChannel);
    };
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      await Promise.all([
        loadMaterials(),
        loadVendors(),
        loadCustomers(),
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadMaterials() {
    try {
      console.log('📦 Loading materials from materials_catalog...');
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('*')
        .order('material_name');

      if (error) throw error;
      console.log(`✅ Loaded ${data?.length || 0} materials from catalog`);
      setMaterials(data || []);
    } catch (error: any) {
      console.error('❌ Error loading materials:', error);
      toast.error('Failed to load materials from catalog');
    }
  }

  async function loadVendors() {
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .order('name');

      if (error) throw error;
      setVendors(data || []);
    } catch (error: any) {
      console.error('Error loading vendors:', error);
    }
  }

  async function loadCustomers() {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('category', 'customer')
        .order('name');

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      console.error('Error loading customers:', error);
    }
  }

  async function loadSyncStatus() {
    try {
      const { data, error } = await supabase
        .from('zoho_integration_settings')
        .select('last_sync_at')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data?.last_sync_at) {
        setLastSyncTime(data.last_sync_at);
      }
    } catch (error: any) {
      console.error('Error loading sync status:', error);
    }
  }

  async function syncFromZoho() {
    setSyncing(true);
    try {
      toast.info('Starting sync from Zoho Books...');

      const { data, error } = await supabase.functions.invoke('zoho-sync', {
        body: { action: 'sync_materials' },
      });

      if (error) {
        let errorMessage = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const statusCode = error.context?.status ?? 500;
            const textContent = await error.context?.text();
            errorMessage = `[Code: ${statusCode}] ${textContent || error.message || 'Unknown error'}`;
          } catch {
            errorMessage = error.message || 'Failed to read response';
          }
        }
        throw new Error(errorMessage);
      }

      const message = data.message || 'Sync completed successfully';
      console.log('✅ Zoho sync result:', data);
      toast.success(message, { duration: 5000 });
      
      // Force reload all data
      await loadData();
      await loadSyncStatus();
      
      // Show detailed sync results
      if (data.itemsInserted > 0 || data.itemsUpdated > 0) {
        toast.success(
          `📊 Sync Details:\n` +
          `• ${data.itemsInserted || 0} new materials added to catalog\n` +
          `• ${data.itemsUpdated || 0} materials updated\n` +
          `• ${data.vendorsSynced || 0} vendors synced\n\n` +
          `✅ Materials are now available in the Materials Catalog`,
          { duration: 10000 }
        );
        
        // Additional guidance
        toast.info(
          `💡 To use these materials in jobs:\n` +
          `1. Go to a Job's Materials tab\n` +
          `2. Click "Add Material"\n` +
          `3. Click "Search Database" to browse synced materials`,
          { duration: 12000 }
        );
      }
    } catch (error: any) {
      console.error('Sync error:', error);
      toast.error(`Sync failed: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  }

  function formatDateTime(dateString: string | null): string {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  const filteredMaterials = materials.filter(m =>
    searchTerm === '' ||
    m.material_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.category && m.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredVendors = vendors.filter(v =>
    searchTerm === '' ||
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.email && v.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (v.phone && v.phone.includes(searchTerm))
  );

  const filteredCustomers = customers.filter(c =>
    searchTerm === '' ||
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone && c.phone.includes(searchTerm)) ||
    (c.company_name && c.company_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading Zoho data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-2 border-purple-300 bg-gradient-to-r from-purple-50 to-blue-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <RefreshCw className="w-6 h-6 text-purple-600" />
                Zoho Books Data Sync
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                View and manage materials, customers, and vendors synced with Zoho Books
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Button
                onClick={syncFromZoho}
                disabled={syncing}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              >
                {syncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Sync from Zoho
                  </>
                )}
              </Button>
              {lastSyncTime && (
                <p className="text-xs text-muted-foreground">
                  Last sync: {formatDateTime(lastSyncTime)}
                </p>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-2">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Materials</p>
                <p className="text-3xl font-bold">{materials.length}</p>
              </div>
              <Package className="w-10 h-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Vendors</p>
                <p className="text-3xl font-bold">{vendors.length}</p>
              </div>
              <Building2 className="w-10 h-10 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Customers</p>
                <p className="text-3xl font-bold">{customers.length}</p>
              </div>
              <Users className="w-10 h-10 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="materials">
            <Package className="w-4 h-4 mr-2" />
            Materials ({materials.length})
          </TabsTrigger>
          <TabsTrigger value="vendors">
            <Building2 className="w-4 h-4 mr-2" />
            Vendors ({vendors.length})
          </TabsTrigger>
          <TabsTrigger value="customers">
            <Users className="w-4 h-4 mr-2" />
            Customers ({customers.length})
          </TabsTrigger>
        </TabsList>

        {/* Search Bar */}
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${activeTab}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchTerm('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Materials Tab */}
        <TabsContent value="materials" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              {filteredMaterials.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">
                    {searchTerm ? 'No materials found' : 'No materials synced yet'}
                  </p>
                  {!searchTerm && (
                    <Button onClick={syncFromZoho} className="mt-4">
                      <Upload className="w-4 h-4 mr-2" />
                      Sync from Zoho Books
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Material Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Length</TableHead>
                        <TableHead className="text-right">Purchase Cost</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead>Synced</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMaterials.map((material) => (
                        <TableRow key={material.sku}>
                          <TableCell className="font-mono text-sm">{material.sku}</TableCell>
                          <TableCell className="font-medium">{material.material_name}</TableCell>
                          <TableCell>
                            {material.category ? (
                              <Badge variant="outline">{material.category}</Badge>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>{material.part_length || '-'}</TableCell>
                          <TableCell className="text-right font-mono">
                            {material.purchase_cost ? `$${material.purchase_cost.toFixed(2)}` : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {material.unit_price ? `$${material.unit_price.toFixed(2)}` : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-green-100 text-green-800 border-green-300">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Zoho
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vendors Tab */}
        <TabsContent value="vendors" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              {filteredVendors.length === 0 ? (
                <div className="text-center py-12">
                  <Building2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">
                    {searchTerm ? 'No vendors found' : 'No vendors synced yet'}
                  </p>
                  {!searchTerm && (
                    <Button onClick={syncFromZoho} className="mt-4">
                      <Upload className="w-4 h-4 mr-2" />
                      Sync from Zoho Books
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Contact Person</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVendors.map((vendor) => (
                        <TableRow key={vendor.id}>
                          <TableCell className="font-medium">{vendor.name}</TableCell>
                          <TableCell>{vendor.contact_person || '-'}</TableCell>
                          <TableCell>{vendor.email || '-'}</TableCell>
                          <TableCell>{vendor.phone || '-'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDateTime(vendor.created_at)}
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-green-100 text-green-800 border-green-300">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Zoho
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customers Tab */}
        <TabsContent value="customers" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              {filteredCustomers.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">
                    {searchTerm ? 'No customers found' : 'No customers yet'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Customers are created automatically when creating Zoho orders
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCustomers.map((customer) => (
                        <TableRow key={customer.id}>
                          <TableCell className="font-medium">{customer.name}</TableCell>
                          <TableCell>{customer.company_name || '-'}</TableCell>
                          <TableCell>{customer.email}</TableCell>
                          <TableCell>{customer.phone || '-'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDateTime(customer.created_at)}
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Active
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Info Box */}
      <Card className="border-2 border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-700 mt-0.5" />
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-blue-900">How Zoho Sync Works:</p>
              <ul className="space-y-1 text-blue-800">
                <li>• <strong>Materials:</strong> Synced from Zoho Books items to your materials catalog</li>
                <li>• <strong>Vendors:</strong> Synced from Zoho Books contacts (vendor type)</li>
                <li>• <strong>Customers:</strong> Created automatically when you create Sales Orders from jobs</li>
                <li>• <strong>Orders:</strong> Sales Orders and Purchase Orders are created in Zoho when you order materials from packages</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
