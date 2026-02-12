
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Building2,
  Package,
  LineChart as LineChartIcon,
  Calendar,
  Users,
  Share2,
  Copy,
  ExternalLink,
  BarChart3,
  Minus,
  Loader2,
  Settings,
  Trash2,
  Edit,
  X,
  Truck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const CHART_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

interface Material {
  id: string;
  name: string;
  category: string;
  unit: string;
  standard_length: number;
  active: boolean;
  order_index: number;
  created_at: string;
}

interface Vendor {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  active: boolean;
  created_at: string;
}

interface PriceEntry {
  id: string;
  material_id: string;
  vendor_id: string;
  price_per_unit: number;
  mbf_price: number | null;
  truckload_quantity: number | null;
  shipment_group_id: string | null;
  effective_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  vendor?: Vendor;
  material?: Material;
}

interface LumberRebarPricingProps {
  category: 'lumber' | 'rebar';
}

export function LumberRebarPricing({ category }: LumberRebarPricingProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [prices, setPrices] = useState<PriceEntry[]>([]);

  // Vendor tab state
  const [selectedVendorTab, setSelectedVendorTab] = useState<string>('');

  // Expanded material for history
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);

  // Dialogs
  const [showVendorPricingDialog, setShowVendorPricingDialog] = useState(false);
  const [showPriceHistoryDialog, setShowPriceHistoryDialog] = useState(false);
  const [showMaterialDetailDialog, setShowMaterialDetailDialog] = useState(false);

  // Selected items
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  // Form states
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);

  // Bulk pricing for vendor
  const [bulkPrices, setBulkPrices] = useState<Record<string, { mbf: string; perUnit: string; truckload: string; notes: string }>>({});

  // Share link dialog
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareVendor, setShareVendor] = useState<Vendor | null>(null);
  const [shareLink, setShareLink] = useState('');
  const [shareExpireDays, setShareExpireDays] = useState('30');
  const [generatingLink, setGeneratingLink] = useState(false);

  // Vendor submission history
  const [showVendorHistoryDialog, setShowVendorHistoryDialog] = useState(false);
  const [historyVendor, setHistoryVendor] = useState<Vendor | null>(null);

  // Analytics filters
  const [timeRange, setTimeRange] = useState<'30' | '90' | '180' | '365'>('90');

  // Settings dialog
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'materials' | 'vendors'>('materials');

  // Material form
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [materialForm, setMaterialForm] = useState({
    name: '',
    unit: 'board foot',
    standard_length: 16,
  });

  // Vendor form
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [vendorForm, setVendorForm] = useState({
    name: '',
    contact_name: '',
    phone: '',
    email: '',
    logo_url: '',
  });

  useEffect(() => {
    loadData();

    const materialsChannel = supabase
      .channel('lumber_rebar_materials_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lumber_rebar_materials' },
        () => loadMaterials()
      )
      .subscribe();

    const vendorsChannel = supabase
      .channel('lumber_rebar_vendors_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lumber_rebar_vendors' },
        () => loadVendors()
      )
      .subscribe();

    const pricesChannel = supabase
      .channel('lumber_rebar_prices_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'lumber_rebar_prices' },
        () => {
          console.log('✅ Price update detected - refreshing analytics...');
          loadPrices();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(materialsChannel);
      supabase.removeChannel(vendorsChannel);
      supabase.removeChannel(pricesChannel);
    };
  }, []);

  function calculateBoardFeet(materialName: string, length: number): number {
    const match = materialName.match(/(\d+)\s*x\s*(\d+)/i);
    if (!match) return 1;

    const thickness = parseInt(match[1]);
    const width = parseInt(match[2]);

    const boardFeet = (thickness * width * length) / 12;
    return boardFeet;
  }

  async function loadData() {
    setLoading(true);
    try {
      await Promise.all([
        loadMaterials(),
        loadVendors(),
        loadPrices(),
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load pricing data');
    } finally {
      setLoading(false);
    }
  }

  async function loadMaterials() {
    const { data, error } = await supabase
      .from('lumber_rebar_materials')
      .select('*')
      .eq('active', true)
      .order('order_index', { ascending: true });

    if (error) throw error;
    setMaterials(data || []);
  }

  async function loadVendors() {
    const { data, error } = await supabase
      .from('lumber_rebar_vendors')
      .select('*')
      .eq('active', true)
      .order('name');

    if (error) throw error;
    setVendors(data || []);
  }

  async function loadPrices() {
    const { data, error } = await supabase
      .from('lumber_rebar_prices')
      .select(`
        *,
        vendor:lumber_rebar_vendors(*),
        material:lumber_rebar_materials(*)
      `)
      .order('effective_date', { ascending: false });

    if (error) throw error;
    console.log(`📊 Loaded ${data?.length || 0} price entries - sorted by latest first`);
    setPrices(data || []);
  }

  function openVendorPricing(vendor: Vendor) {
    setSelectedVendor(vendor);
    setBulkPrices({});
    setEffectiveDate(new Date().toISOString().split('T')[0]);
    setShowVendorPricingDialog(true);
  }

  function openPriceHistory(material: Material) {
    setSelectedMaterial(material);
    setShowPriceHistoryDialog(true);
  }

  function openVendorHistory(vendor: Vendor) {
    setHistoryVendor(vendor);
    setShowVendorHistoryDialog(true);
  }

  // Get vendor submission history grouped by actual submission batches
  function getVendorSubmissionHistory(vendorId: string) {
    const vendorPrices = prices
      .filter(p => p.vendor_id === vendorId && materials.find(m => m.id === p.material_id && m.category === category))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Group by exact submission time (within 1 minute = same batch)
    const batches: PriceEntry[][] = [];
    
    vendorPrices.forEach(price => {
      const priceTime = new Date(price.created_at).getTime();
      
      // Find existing batch within 1 minute
      const existingBatch = batches.find(batch => {
        const batchTime = new Date(batch[0].created_at).getTime();
        return Math.abs(priceTime - batchTime) < 60000; // 1 minute tolerance
      });
      
      if (existingBatch) {
        existingBatch.push(price);
      } else {
        batches.push([price]);
      }
    });

    return batches.map(entries => ({
      submissionDate: entries[0].created_at,
      entries: entries.sort((a, b) => {
        const matA = materials.find(m => m.id === a.material_id);
        const matB = materials.find(m => m.id === b.material_id);
        return (matA?.order_index || 0) - (matB?.order_index || 0);
      }),
      totalItems: entries.length,
    }));
  }

  async function saveBulkPrices() {
    if (!selectedVendor) return;

    const pricesToSave = Object.entries(bulkPrices)
      .filter(([_, price]) => price.perUnit && parseFloat(price.perUnit) > 0)
      .map(([materialId, price]) => {
        const material = materials.find(m => m.id === materialId);
        const boardFeet = material && material.unit === 'board foot'
          ? calculateBoardFeet(material.name, material.standard_length)
          : null;
        
        return {
          material_id: materialId,
          vendor_id: selectedVendor.id,
          price_per_unit: parseFloat(price.perUnit),
          mbf_price: boardFeet && price.mbf ? parseFloat(price.mbf) : null,
          truckload_quantity: price.truckload ? parseInt(price.truckload) : null,
          effective_date: effectiveDate,
          notes: price.notes || null,
          created_by: profile?.id || null,
        };
      });

    if (pricesToSave.length === 0) {
      toast.error('Please enter at least one price');
      return;
    }

    try {
      const { error } = await supabase
        .from('lumber_rebar_prices')
        .insert(pricesToSave);

      if (error) throw error;

      toast.success(`Added ${pricesToSave.length} prices for ${selectedVendor.name}`);
      setShowVendorPricingDialog(false);
      setBulkPrices({});
      setSelectedVendor(null);
      await loadPrices();
    } catch (error: any) {
      console.error('Error saving bulk prices:', error);
      toast.error('Failed to save prices');
    }
  }

  async function deletePriceEntry(priceId: string, materialName: string, vendorName: string) {
    if (!confirm(`Delete price entry for ${materialName} from ${vendorName}?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('lumber_rebar_prices')
        .delete()
        .eq('id', priceId);

      if (error) throw error;

      toast.success('Price entry deleted');
      await loadPrices();
    } catch (error: any) {
      console.error('Error deleting price:', error);
      toast.error('Failed to delete price entry');
    }
  }

  function updateBulkPrice(materialId: string, field: 'mbf' | 'perUnit' | 'truckload' | 'notes', value: string) {
    setBulkPrices(prev => ({
      ...prev,
      [materialId]: {
        ...prev[materialId],
        [field]: value,
      }
    }));

    if (field === 'mbf' && value) {
      const material = materials.find(m => m.id === materialId);
      if (material && material.unit === 'board foot') {
        const boardFeet = calculateBoardFeet(material.name, material.standard_length);
        const pricePerBF = parseFloat(value) / 1000;
        const pricePerPiece = pricePerBF * boardFeet;

        setBulkPrices(prev => ({
          ...prev,
          [materialId]: {
            ...prev[materialId],
            perUnit: pricePerPiece.toFixed(2),
          }
        }));
      }
    }
  }

  // Material management functions
  function openMaterialForm(material?: Material) {
    if (material) {
      setEditingMaterial(material);
      setMaterialForm({
        name: material.name,
        unit: material.unit,
        standard_length: material.standard_length,
      });
    } else {
      setEditingMaterial(null);
      setMaterialForm({
        name: '',
        unit: 'board foot',
        standard_length: 16,
      });
    }
  }

  async function saveMaterial() {
    if (!materialForm.name.trim()) {
      toast.error('Material name is required');
      return;
    }

    try {
      const materialData = {
        name: materialForm.name.trim(),
        category,
        unit: materialForm.unit,
        standard_length: materialForm.standard_length,
        active: true,
        order_index: materials.length,
      };

      if (editingMaterial) {
        const { error } = await supabase
          .from('lumber_rebar_materials')
          .update(materialData)
          .eq('id', editingMaterial.id);

        if (error) throw error;
        toast.success('Material updated successfully');
      } else {
        const { error } = await supabase
          .from('lumber_rebar_materials')
          .insert(materialData);

        if (error) throw error;
        toast.success('Material added successfully');
      }

      setEditingMaterial(null);
      setMaterialForm({ name: '', unit: 'board foot', standard_length: 16 });
      await loadMaterials();
    } catch (error: any) {
      console.error('Error saving material:', error);
      toast.error('Failed to save material');
    }
  }

  async function deleteMaterial(material: Material) {
    if (!confirm(`Are you sure you want to delete "${material.name}"? This will also delete all associated prices.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('lumber_rebar_materials')
        .delete()
        .eq('id', material.id);

      if (error) throw error;
      toast.success('Material deleted successfully');
      await loadMaterials();
    } catch (error: any) {
      console.error('Error deleting material:', error);
      toast.error('Failed to delete material');
    }
  }

  // Vendor management functions
  function openVendorForm(vendor?: Vendor) {
    if (vendor) {
      setEditingVendor(vendor);
      setVendorForm({
        name: vendor.name,
        contact_name: vendor.contact_name || '',
        phone: vendor.phone || '',
        email: vendor.email || '',
        logo_url: vendor.logo_url || '',
      });
    } else {
      setEditingVendor(null);
      setVendorForm({
        name: '',
        contact_name: '',
        phone: '',
        email: '',
        logo_url: '',
      });
    }
  }

  async function saveVendor() {
    if (!vendorForm.name.trim()) {
      toast.error('Vendor name is required');
      return;
    }

    try {
      const vendorData = {
        name: vendorForm.name.trim(),
        contact_name: vendorForm.contact_name.trim() || null,
        phone: vendorForm.phone.trim() || null,
        email: vendorForm.email.trim() || null,
        logo_url: vendorForm.logo_url.trim() || null,
        active: true,
      };

      if (editingVendor) {
        const { error } = await supabase
          .from('lumber_rebar_vendors')
          .update(vendorData)
          .eq('id', editingVendor.id);

        if (error) throw error;
        toast.success('Vendor updated successfully');
      } else {
        const { error } = await supabase
          .from('lumber_rebar_vendors')
          .insert(vendorData);

        if (error) throw error;
        toast.success('Vendor added successfully');
      }

      setEditingVendor(null);
      setVendorForm({ name: '', contact_name: '', phone: '', email: '', logo_url: '' });
      await loadVendors();
    } catch (error: any) {
      console.error('Error saving vendor:', error);
      toast.error('Failed to save vendor');
    }
  }

  async function deleteVendor(vendor: Vendor) {
    if (!confirm(`Are you sure you want to delete "${vendor.name}"? This will also delete all associated prices.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('lumber_rebar_vendors')
        .delete()
        .eq('id', vendor.id);

      if (error) throw error;
      toast.success('Vendor deleted successfully');
      await loadVendors();
    } catch (error: any) {
      console.error('Error deleting vendor:', error);
      toast.error('Failed to delete vendor');
    }
  }

  // Get latest price for a specific material/vendor combination (sorted by effective_date)
  function getLatestPrice(materialId: string, vendorId: string): PriceEntry | null {
    const materialPrices = prices
      .filter(p => p.material_id === materialId && p.vendor_id === vendorId)
      .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime());

    return materialPrices.length > 0 ? materialPrices[0] : null;
  }

  // Get all price history for a material (sorted by date descending)
  function getMaterialPriceHistory(materialId: string): PriceEntry[] {
    return prices
      .filter(p => p.material_id === materialId)
      .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime());
  }

  const filteredMaterials = materials.filter(m => m.category === category);

  // Get average price based on LATEST price from each vendor
  function getAveragePrice(materialId: string): number | null {
    const latestByVendor = new Map<string, PriceEntry>();

    prices
      .filter(p => p.material_id === materialId)
      .forEach(price => {
        const existing = latestByVendor.get(price.vendor_id);
        if (!existing || new Date(price.effective_date) > new Date(existing.effective_date)) {
          latestByVendor.set(price.vendor_id, price);
        }
      });

    const latestPrices = Array.from(latestByVendor.values());
    if (latestPrices.length === 0) return null;

    return latestPrices.reduce((sum, p) => sum + p.price_per_unit, 0) / latestPrices.length;
  }

  // Calculate price trend comparing current vs historical prices
  function getPriceTrend(materialId: string): 'up' | 'down' | 'stable' {
    const latestByVendor = new Map<string, PriceEntry>();

    prices
      .filter(p => p.material_id === materialId)
      .forEach(price => {
        const existing = latestByVendor.get(price.vendor_id);
        if (!existing || new Date(price.effective_date) > new Date(existing.effective_date)) {
          latestByVendor.set(price.vendor_id, price);
        }
      });

    const allPrices = prices
      .filter(p => p.material_id === materialId)
      .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime())
      .slice(0, 10);

    if (allPrices.length < 2) return 'stable';

    const currentPrices = Array.from(latestByVendor.values());
    const currentAvg = currentPrices.reduce((sum, p) => sum + p.price_per_unit, 0) / currentPrices.length;

    const historicalPrices = allPrices.slice(currentPrices.length);
    if (historicalPrices.length === 0) return 'stable';

    const historicalAvg = historicalPrices.reduce((sum, p) => sum + p.price_per_unit, 0) / historicalPrices.length;

    if (currentAvg > historicalAvg * 1.05) return 'up';
    if (currentAvg < historicalAvg * 0.95) return 'down';
    return 'stable';
  }

  function getVendorCount(materialId: string): number {
    const uniqueVendors = new Set(prices.filter(p => p.material_id === materialId).map(p => p.vendor_id));
    return uniqueVendors.size;
  }

  // Get best price from LATEST prices only
  function getBestPrice(materialId: string): { vendor: string; price: number } | null {
    const latestByVendor = new Map<string, PriceEntry>();

    prices
      .filter(p => p.material_id === materialId)
      .forEach(price => {
        const existing = latestByVendor.get(price.vendor_id);
        if (!existing || new Date(price.effective_date) > new Date(existing.effective_date)) {
          latestByVendor.set(price.vendor_id, price);
        }
      });

    const best = Array.from(latestByVendor.values()).sort((a, b) => a.price_per_unit - b.price_per_unit)[0];
    return best ? { vendor: best.vendor?.name || 'Unknown', price: best.price_per_unit } : null;
  }

  function getPriceHistoryChartData(materialId: string) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(timeRange));

    const filteredPrices = prices
      .filter(p => p.material_id === materialId && new Date(p.effective_date) >= cutoffDate)
      .sort((a, b) => new Date(a.effective_date).getTime() - new Date(b.effective_date).getTime());

    const vendorData: Record<string, any[]> = {};

    filteredPrices.forEach(entry => {
      const vendorName = entry.vendor?.name || 'Unknown';
      if (!vendorData[vendorName]) {
        vendorData[vendorName] = [];
      }
      vendorData[vendorName].push({
        date: entry.effective_date,
        price: entry.price_per_unit,
      });
    });

    const allDates = [...new Set(filteredPrices.map(p => p.effective_date))].sort();

    return allDates.map(date => {
      const dataPoint: any = {
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: date,
      };

      Object.keys(vendorData).forEach(vendorName => {
        const entry = vendorData[vendorName].find(e => e.date === date);
        if (entry) {
          dataPoint[vendorName] = entry.price;
        }
      });

      return dataPoint;
    });
  }

  async function generateShareLink(vendor: Vendor) {
    setShareVendor(vendor);
    setShareLink('');
    setGeneratingLink(true);
    setShowShareDialog(true);

    try {
      if (!vendor || !vendor.id) {
        throw new Error('Invalid vendor selected');
      }

      if (!profile?.id) {
        throw new Error('User profile not found. Please refresh and try again.');
      }

      const token = crypto.randomUUID();

      const expiresAt = shareExpireDays ? (() => {
        const days = parseInt(shareExpireDays);
        if (isNaN(days) || days <= 0) {
          return null;
        }
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date.toISOString();
      })() : null;

      const insertData = {
        vendor_id: vendor.id,
        category,
        token,
        expires_at: expiresAt,
        created_by: profile.id,
        notes: `Generated for ${vendor.name}`,
        is_active: true,
      };

      const { data, error } = await supabase
        .from('lumber_rebar_vendor_links')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      const baseUrl = window.location.origin;
      const link = `${baseUrl}/vendor-pricing/${token}`;
      setShareLink(link);

      toast.success('Shareable link created!');
    } catch (error: any) {
      console.error('Error generating share link:', error);
      const errorMessage = error?.message || 'Unknown error occurred';
      toast.error(`Failed to generate link: ${errorMessage}`);
      setShowShareDialog(false);
    } finally {
      setGeneratingLink(false);
    }
  }

  function copyToClipboard() {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      toast.success('Link copied to clipboard!');
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading pricing data...</p>
      </div>
    );
  }

  // Get best price info for display - REMOVED useMemo to fix infinite loop
  const materialPriceInfo = filteredMaterials.map(material => {
    const bestPrice = getBestPrice(material.id);
    const avgPrice = getAveragePrice(material.id);
    const trend = getPriceTrend(material.id);
    const vendorCount = getVendorCount(material.id);
    const history = getMaterialPriceHistory(material.id).slice(0, 5);

    return {
      material,
      bestPrice,
      avgPrice,
      trend,
      vendorCount,
      recentHistory: history,
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            {category === 'lumber' ? <Package className="w-7 h-7 text-blue-600" /> : <Building2 className="w-7 h-7 text-blue-600" />}
            {category === 'lumber' ? 'Lumber Pricing' : 'Rebar Pricing'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {filteredMaterials.length} materials
          </p>
        </div>
        <Button
          onClick={() => setShowSettingsDialog(true)}
          variant="outline"
          className="flex items-center gap-2"
        >
          <Settings className="w-4 h-4" />
          Settings
        </Button>
      </div>

      {/* Two Column Layout: Vendors Left, Materials Right */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Sidebar: Vendor Cards */}
        <div className="col-span-3 space-y-3">
          <div className="sticky top-4">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Vendors
            </h3>
            {vendors.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  <p>No vendors yet.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => setShowSettingsDialog(true)}
                  >
                    Add Vendor
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {vendors.map(vendor => {
                  const vendorPrices = prices.filter(p => p.vendor_id === vendor.id && materials.find(m => m.id === p.material_id && m.category === category));
                  const materialsWithPrices = new Set(vendorPrices.map(p => p.material_id));
                  const pricesCount = materialsWithPrices.size;

                  return (
                    <Card key={vendor.id} className="border hover:border-blue-300 transition-colors">
                      <CardContent className="p-3">
                        <div className="space-y-2">
                          {vendor.logo_url && (
                            <img 
                              src={vendor.logo_url} 
                              alt={vendor.name}
                              className="h-10 w-auto object-contain mx-auto"
                            />
                          )}
                          <div className="text-center">
                            <h4 className="font-semibold text-sm truncate">{vendor.name}</h4>
                            <Badge variant="secondary" className="text-xs mt-1">
                              {pricesCount}/{filteredMaterials.length}
                            </Badge>
                          </div>
                          
                          <Button
                            size="sm"
                            variant={selectedVendorTab === vendor.id ? 'default' : 'outline'}
                            onClick={() => {
                              setSelectedVendorTab(vendor.id);
                              openVendorPricing(vendor);
                            }}
                            className="w-full"
                          >
                            <DollarSign className="w-3 h-3 mr-1" />
                            Price
                          </Button>
                          
                          <div className="grid grid-cols-2 gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openVendorHistory(vendor)}
                              className="text-xs"
                            >
                              <Calendar className="w-3 h-3 mr-1" />
                              History
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => generateShareLink(vendor)}
                              className="text-xs"
                            >
                              <Share2 className="w-3 h-3 mr-1" />
                              Share
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Main Content: Materials List */}
        <div className="col-span-9">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="w-5 h-5" />
                Materials & Pricing
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {materialPriceInfo.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>No {category} materials found</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setShowSettingsDialog(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Materials
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {materialPriceInfo.map((info, idx) => {
                    const isExpanded = expandedMaterial === info.material.id;
                    const boardFeet = info.material.unit === 'board foot'
                      ? calculateBoardFeet(info.material.name, info.material.standard_length)
                      : null;

                    return (
                      <div key={info.material.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        {/* Material Row */}
                        <div
                          className="p-4 hover:bg-blue-50 cursor-pointer transition-colors"
                          onClick={() => setExpandedMaterial(isExpanded ? null : info.material.id)}
                        >
                          <div className="flex items-center justify-between gap-4">
                            {/* Material Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3">
                                <h3 className="font-semibold text-lg">{info.material.name}</h3>
                                {info.trend === 'up' && (
                                  <Badge className="bg-red-100 text-red-800 border-red-300">
                                    <TrendingUp className="w-3 h-3 mr-1" />
                                    Rising
                                  </Badge>
                                )}
                                {info.trend === 'down' && (
                                  <Badge className="bg-green-100 text-green-800 border-green-300">
                                    <TrendingDown className="w-3 h-3 mr-1" />
                                    Falling
                                  </Badge>
                                )}
                                {info.trend === 'stable' && (
                                  <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                                    <Minus className="w-3 h-3 mr-1" />
                                    Stable
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                                <span>{info.material.standard_length}' length</span>
                                {boardFeet && <span>{boardFeet.toFixed(2)} BF/piece</span>}
                              </div>
                            </div>

                            {/* Best Price */}
                            <div className="text-right">
                              {info.bestPrice ? (
                                <>
                                  <div className="text-3xl font-bold text-green-700">
                                    ${info.bestPrice.price.toFixed(2)}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {info.bestPrice.vendor}
                                  </div>
                                </>
                              ) : (
                                <div className="text-muted-foreground">No pricing</div>
                              )}
                            </div>

                            {/* Average Price */}
                            {info.avgPrice && (
                              <div className="text-right border-l pl-4">
                                <div className="text-lg font-semibold text-slate-700">
                                  ${info.avgPrice.toFixed(2)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Average
                                </div>
                              </div>
                            )}

                            {/* Expand Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedMaterial(isExpanded ? null : info.material.id);
                              }}
                            >
                              <LineChartIcon className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Expanded: Price History by Vendor */}
                        {isExpanded && (
                          <div className="border-t bg-slate-50 p-4">
                            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              Price History by Vendor
                            </h4>
                            {info.recentHistory.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                No price history available
                              </p>
                            ) : (
                              <div className="space-y-4">
                                {/* Group by vendor */}
                                {(() => {
                                  const vendorGroups = info.recentHistory.reduce((acc, entry) => {
                                    const vendorName = entry.vendor?.name || 'Unknown';
                                    if (!acc[vendorName]) acc[vendorName] = [];
                                    acc[vendorName].push(entry);
                                    return acc;
                                  }, {} as Record<string, PriceEntry[]>);

                                  return Object.entries(vendorGroups).map(([vendorName, entries]) => {
                                    const boardFeet = info.material.unit === 'board foot'
                                      ? calculateBoardFeet(info.material.name, info.material.standard_length)
                                      : null;

                                    return (
                                      <div key={vendorName} className="space-y-2">
                                        <div className="font-semibold text-base flex items-center gap-2 text-blue-700">
                                          <Users className="w-4 h-4" />
                                          {vendorName}
                                          <Badge variant="secondary" className="text-xs">
                                            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                                          </Badge>
                                        </div>
                                        <div className="space-y-2 pl-6">
                                          {entries.map(entry => (
                                            <div
                                              key={entry.id}
                                              className="flex items-center justify-between p-3 bg-white rounded-lg border hover:border-blue-300 transition-colors"
                                            >
                                              <div className="flex items-center gap-4">
                                                <div>
                                                  <div className="text-sm font-medium">
                                                    {new Date(entry.effective_date).toLocaleDateString('en-US', {
                                                      month: 'short',
                                                      day: 'numeric',
                                                      year: 'numeric',
                                                    })}
                                                  </div>
                                                  {entry.notes && (
                                                    <div className="text-xs text-muted-foreground mt-1">
                                                      {entry.notes}
                                                    </div>
                                                  )}
                                                </div>
                                                {entry.mbf_price && boardFeet && (
                                                  <Badge variant="outline" className="bg-blue-50 text-xs">
                                                    ${entry.mbf_price.toFixed(2)}/MBF
                                                  </Badge>
                                                )}
                                                {entry.truckload_quantity && (
                                                  <Badge variant="outline" className="text-xs">
                                                    {entry.truckload_quantity} units
                                                  </Badge>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-3">
                                                <div className="text-right">
                                                  <div className="text-xl font-bold text-blue-700">
                                                    ${entry.price_per_unit.toFixed(2)}
                                                  </div>
                                                  <div className="text-xs text-muted-foreground">per piece</div>
                                                </div>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                  onClick={() => deletePriceEntry(entry.id, info.material.name, vendorName)}
                                                >
                                                  <Trash2 className="w-4 h-4" />
                                                </Button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            )}

                            {/* Price Chart */}
                            {info.recentHistory.length > 1 && (
                              <div className="mt-4">
                                <ResponsiveContainer width="100%" height={200}>
                                  <LineChart data={getPriceHistoryChartData(info.material.id).slice(-10)}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                    <YAxis tick={{ fontSize: 12 }} />
                                    <Tooltip />
                                    <Legend />
                                    {(() => {
                                      const uniqueVendors = [...new Set(info.recentHistory.map(h => h.vendor?.name || 'Unknown'))];
                                      return uniqueVendors.map((vendorName, i) => (
                                        <Line
                                          key={vendorName}
                                          type="monotone"
                                          dataKey={vendorName}
                                          stroke={CHART_COLORS[i % CHART_COLORS.length]}
                                          strokeWidth={2}
                                          dot={{ r: 4 }}
                                        />
                                      ));
                                    })()}
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

{/* ...remaining code stays the same until the submission history table sorting... */}
    </div>
  );
}
