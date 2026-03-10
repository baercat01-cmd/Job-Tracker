
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
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  CheckCircle2,
  Clock,
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
  ReferenceLine,
} from 'recharts';
import {
  LumberPurchaseOrderDialog,
  type LumberPORecord,
} from './LumberPurchaseOrderDialog';

const CHART_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

interface Material {
  id: string;
  name: string;
  category: string;
  unit: string;
  standard_length: number;
  sku: string | null;
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
  shipment_group_color: string | null;
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
  // Which vendor price-history dropdowns are open: key = "materialId::vendorName"
  const [openVendorPanels, setOpenVendorPanels] = useState<Set<string>>(new Set());

  function toggleVendorPanel(materialId: string, vendorName: string) {
    const key = `${materialId}::${vendorName}`;
    setOpenVendorPanels(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

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
    sku: '',
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

  // Purchase orders
  const [purchaseOrders, setPurchaseOrders] = useState<LumberPORecord[]>([]);
  const [showPODialog, setShowPODialog] = useState(false);
  const [poMaterial, setPoMaterial] = useState<Material | null>(null);
  const [poVendor, setPoVendor] = useState<Vendor | null>(null);
  const [poDefaultPrice, setPoDefaultPrice] = useState(0);

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
        loadPurchaseOrders(),
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

  async function loadPurchaseOrders() {
    // First try with joins; if the schema cache doesn't know the FK yet, fall back to plain select.
    const { data, error } = await supabase
      .from('lumber_purchase_orders')
      .select(`
        *,
        vendor:lumber_rebar_vendors(*),
        material:lumber_rebar_materials(*)
      `)
      .order('order_date', { ascending: false });

    if (error) {
      if (error.message?.includes('relationship') || error.message?.includes('schema cache')) {
        // FK not in schema cache yet — reload schema and retry without joins
        await supabase.rpc('notify_pgrst_reload' as any).catch(() => null);
        const { data: plain, error: plainError } = await supabase
          .from('lumber_purchase_orders')
          .select('*')
          .order('order_date', { ascending: false });
        if (plainError) {
          console.warn('lumber_purchase_orders not available (run migration):', plainError.message);
          return;
        }
        // Attach vendor/material from already-loaded arrays
        const enriched = (plain || []).map((po: any) => ({
          ...po,
          vendor: vendors.find(v => v.id === po.vendor_id) ?? null,
          material: materials.find(m => m.id === po.material_id) ?? null,
        }));
        setPurchaseOrders(enriched as LumberPORecord[]);
        return;
      }
      console.warn('lumber_purchase_orders error:', error.message);
      return;
    }
    setPurchaseOrders((data as LumberPORecord[]) || []);
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

  function openCreatePO(material: Material, vendor: Vendor, price: number) {
    setPoMaterial(material);
    setPoVendor(vendor);
    setPoDefaultPrice(price);
    setShowPODialog(true);
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
        sku: material.sku ?? '',
      });
    } else {
      setEditingMaterial(null);
      setMaterialForm({
        name: '',
        unit: 'board foot',
        standard_length: 16,
        sku: '',
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
        sku: materialForm.sku.trim() || null,
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
      setMaterialForm({ name: '', unit: 'board foot', standard_length: 16, sku: '' });
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

  // Average price removed — replaced by selling price (cost + 15%)

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

  /**
   * Returns the lowest price entered THIS WEEK (within the last 7 days).
   * If prices exist but are all older than 7 days, returns them flagged as stale
   * so the UI can prompt the user to update.
   * stale = true  → price is outdated; do NOT use for selling-price calculation
   * stale = false → price is current; selling price = price × 1.15
   */
  function getBestPrice(materialId: string): { vendor: string; price: number; stale: boolean; effectiveDate: string } | null {
    const allForMaterial = prices.filter(p => p.material_id === materialId);
    if (allForMaterial.length === 0) return null;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    oneWeekAgo.setHours(0, 0, 0, 0);

    // Latest entry per vendor (across all time)
    const latestByVendor = new Map<string, PriceEntry>();
    allForMaterial.forEach(price => {
      const existing = latestByVendor.get(price.vendor_id);
      if (!existing || new Date(price.effective_date) > new Date(existing.effective_date)) {
        latestByVendor.set(price.vendor_id, price);
      }
    });

    // Vendors whose latest price is from this week
    const currentWeek = Array.from(latestByVendor.values())
      .filter(p => new Date(p.effective_date) >= oneWeekAgo);

    if (currentWeek.length > 0) {
      // Pick the lowest price from this week's entries only
      const best = currentWeek.sort((a, b) => a.price_per_unit - b.price_per_unit)[0];
      return { vendor: best.vendor?.name || 'Unknown', price: best.price_per_unit, stale: false, effectiveDate: best.effective_date };
    }

    // All prices are older than 7 days — show the historic best but flag as stale
    const best = Array.from(latestByVendor.values()).sort((a, b) => a.price_per_unit - b.price_per_unit)[0];
    return best
      ? { vendor: best.vendor?.name || 'Unknown', price: best.price_per_unit, stale: true, effectiveDate: best.effective_date }
      : null;
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
    // Selling price = cost + 15% markup. Only calculated when price is current (not stale).
    const sellingPrice = bestPrice && !bestPrice.stale ? bestPrice.price * 1.15 : null;
    const trend = getPriceTrend(material.id);
    const vendorCount = getVendorCount(material.id);
    const history = getMaterialPriceHistory(material.id).slice(0, 5);

    return {
      material,
      bestPrice,
      sellingPrice,
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
                  return (
                    <Card key={vendor.id} className="border hover:border-blue-300 transition-colors">
                      <CardContent className="p-2">
                        <div className="space-y-2">
                          {/* Vendor Logo and Name */}
                          <div className="flex items-center justify-center gap-2">
                            {vendor.logo_url && (
                              <img 
                                src={vendor.logo_url} 
                                alt={vendor.name}
                                className="h-16 w-auto object-contain"
                              />
                            )}
                          </div>
                          <h4 className="font-semibold text-sm text-center truncate">{vendor.name}</h4>
                          
                          {/* All Buttons in One Row */}
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                console.log('💲 Price button clicked for:', vendor.name);
                                setSelectedVendorTab(vendor.id);
                                openVendorPricing(vendor);
                              }}
                              className="flex-1 h-8 px-1"
                              title="Enter Prices"
                            >
                              <DollarSign className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                console.log('📅 History button clicked for:', vendor.name);
                                openVendorHistory(vendor);
                              }}
                              className="flex-1 h-8 px-1"
                              title="View History"
                            >
                              <Calendar className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                console.log('🔗 Share button clicked for:', vendor.name);
                                generateShareLink(vendor);
                              }}
                              className="flex-1 h-8 px-1"
                              title="Share Link"
                            >
                              <Share2 className="w-4 h-4" />
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

                            {/* Cost (best/lowest this week) + Sell Price */}
                            {info.bestPrice ? (
                              <>
                                <div className="text-right">
                                  <div className={`text-3xl font-bold ${info.bestPrice.stale ? 'text-slate-400' : 'text-green-700'}`}>
                                    ${info.bestPrice.price.toFixed(2)}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {info.bestPrice.vendor}
                                  </div>
                                  {info.bestPrice.stale && (
                                    <div className="text-xs text-amber-600 font-semibold mt-0.5">
                                      ⚠ Outdated — update pricing
                                    </div>
                                  )}
                                </div>
                                {info.sellingPrice && (
                                  <div className="text-right border-l pl-4">
                                    <div className="text-xl font-bold text-blue-700">
                                      ${info.sellingPrice.toFixed(2)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Sell (cost +15%)
                                    </div>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="text-muted-foreground">No pricing</div>
                            )}

                            {/* Create PO Button */}
                            {info.bestPrice && !info.bestPrice.stale && (() => {
                              const bestVendor = vendors.find(v => v.name === info.bestPrice!.vendor);
                              return bestVendor ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="ml-2 border-orange-300 text-orange-700 hover:bg-orange-50"
                                  title="Create Purchase Order"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCreatePO(info.material, bestVendor, info.bestPrice!.price);
                                  }}
                                >
                                  <ShoppingCart className="w-4 h-4" />
                                </Button>
                              ) : null;
                            })()}

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

                        {/* Expanded: chart first, then per-vendor collapsible dropdowns */}
                        {isExpanded && (
                          <div className="border-t bg-slate-50 p-4 space-y-4">

                            {/* ── Price Chart (top) ── */}
                            {info.recentHistory.length > 1 ? (
                              <div>
                                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                  <LineChartIcon className="w-4 h-4" />
                                  Price Trend
                                </h4>
                                {(() => {
                                  const chartData = getPriceHistoryChartData(info.material.id).slice(-10);
                                  const uniqueVendors = [...new Set(info.recentHistory.map(h => h.vendor?.name || 'Unknown'))];

                                  // Compute tight Y-axis range from actual prices
                                  const allPrices = chartData.flatMap(d =>
                                    uniqueVendors.map(v => d[v]).filter((v): v is number => typeof v === 'number')
                                  );

                                  // Include PO prices in Y-axis range
                                  const materialPOs = purchaseOrders.filter(po => po.material_id === info.material.id);
                                  const poPrices = materialPOs.map(po => po.price_per_unit);

                                  const allPricesWithPOs = [...allPrices, ...poPrices];
                                  const minPrice = allPricesWithPOs.length > 0 ? Math.min(...allPricesWithPOs) : 0;
                                  const maxPrice = allPricesWithPOs.length > 0 ? Math.max(...allPricesWithPOs) : 10;
                                  const yMin = Math.max(0, Math.floor(minPrice) - 1);
                                  const yMax = Math.ceil(maxPrice) + 1;
                                  const range = yMax - yMin;
                                  const tickStep = range > 50 ? 10 : range > 20 ? 5 : range > 10 ? 2 : 1;
                                  const yTicks: number[] = [];
                                  for (let t = yMin; t <= yMax; t += tickStep) yTicks.push(t);

                                  // Build PO reference lines — one per distinct PO price
                                  const poReferenceLines = materialPOs.map(po => ({
                                    y: po.price_per_unit,
                                    label: `PO${po.zoho_po_number ? ' #' + po.zoho_po_number : ''} $${po.price_per_unit.toFixed(2)}`,
                                    date: po.order_date,
                                    status: po.status,
                                  }));

                                  return (
                                    <ResponsiveContainer width="100%" height={220}>
                                      <LineChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                        <YAxis
                                          tick={{ fontSize: 12 }}
                                          domain={[yMin, yMax]}
                                          ticks={yTicks}
                                          tickFormatter={(v: number) => `$${v}`}
                                        />
                                        <Tooltip
                                          formatter={(v: number, name: string) => [`$${v.toFixed(2)}`, name]}
                                        />
                                        <Legend />
                                        {uniqueVendors.map((vendorName, i) => (
                                          <Line
                                            key={vendorName}
                                            type="monotone"
                                            dataKey={vendorName}
                                            stroke={CHART_COLORS[i % CHART_COLORS.length]}
                                            strokeWidth={2}
                                            dot={{ r: 4 }}
                                          />
                                        ))}
                                        {/* PO price markers — horizontal dashed lines */}
                                        {poReferenceLines.map((ref, i) => (
                                          <ReferenceLine
                                            key={i}
                                            y={ref.y}
                                            stroke="#f97316"
                                            strokeDasharray="5 3"
                                            strokeWidth={1.5}
                                            label={{
                                              value: ref.label,
                                              position: 'insideTopRight',
                                              fontSize: 10,
                                              fill: '#ea580c',
                                            }}
                                          />
                                        ))}
                                      </LineChart>
                                    </ResponsiveContainer>
                                  );
                                })()}
                              </div>
                            ) : info.recentHistory.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                No price history available
                              </p>
                            ) : null}

                            {/* ── Per-vendor collapsible dropdowns (below chart) ── */}
                            {info.recentHistory.length > 0 && (() => {
                              const vendorGroups = info.recentHistory.reduce((acc, entry) => {
                                const vendorName = entry.vendor?.name || 'Unknown';
                                if (!acc[vendorName]) acc[vendorName] = [];
                                acc[vendorName].push(entry);
                                return acc;
                              }, {} as Record<string, PriceEntry[]>);

                              return (
                                <div className="space-y-2">
                                  <h4 className="font-semibold text-sm flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    Price History by Vendor
                                  </h4>
                                  {Object.entries(vendorGroups).map(([vendorName, entries]) => {
                                    const panelKey = `${info.material.id}::${vendorName}`;
                                    const isOpen = openVendorPanels.has(panelKey);
                                    const boardFeet = info.material.unit === 'board foot'
                                      ? calculateBoardFeet(info.material.name, info.material.standard_length)
                                      : null;

                                    return (
                                      <div key={vendorName} className="border rounded-lg bg-white overflow-hidden">
                                        {/* Dropdown header — click to toggle */}
                                        <button
                                          type="button"
                                          onClick={() => toggleVendorPanel(info.material.id, vendorName)}
                                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
                                        >
                                          <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm">
                                            <Users className="w-4 h-4" />
                                            {vendorName}
                                            <Badge variant="secondary" className="text-xs">
                                              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                                            </Badge>
                                          </div>
                                          {isOpen
                                            ? <ChevronDown className="w-4 h-4 text-slate-500" />
                                            : <ChevronRight className="w-4 h-4 text-slate-500" />
                                          }
                                        </button>

                                        {/* Collapsible price list */}
                                        {isOpen && (
                                          <div className="divide-y border-t">
                                            {entries.map(entry => (
                                              <div
                                                key={entry.id}
                                                className="flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 transition-colors"
                                              >
                                                <div className="flex items-center gap-3">
                                                  <div className="text-sm font-medium">
                                                    {new Date(entry.effective_date).toLocaleDateString('en-US', {
                                                      month: 'short', day: 'numeric', year: 'numeric',
                                                    })}
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
                                                  {entry.notes && (
                                                    <span className="text-xs text-muted-foreground">{entry.notes}</span>
                                                  )}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                  <div className="text-right">
                                                    <div className="text-base font-bold text-blue-700">
                                                      ${entry.price_per_unit.toFixed(2)}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">per piece</div>
                                                  </div>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0"
                                                    onClick={() => deletePriceEntry(entry.id, info.material.name, vendorName)}
                                                  >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                  </Button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}

                            {/* ── Purchase Order History ── */}
                            {(() => {
                              const materialPOs = purchaseOrders.filter(po => po.material_id === info.material.id);
                              if (materialPOs.length === 0) return null;
                              return (
                                <div>
                                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                    <ShoppingCart className="w-4 h-4 text-orange-600" />
                                    Purchase Orders ({materialPOs.length})
                                  </h4>
                                  <div className="space-y-2">
                                    {materialPOs.map(po => (
                                      <div
                                        key={po.id}
                                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-orange-50 border border-orange-200"
                                      >
                                        <div>
                                          <div className="flex items-center gap-2 flex-wrap">
                                            {po.zoho_po_number && (
                                              <Badge className="bg-orange-600 text-white text-xs">
                                                PO #{po.zoho_po_number}
                                              </Badge>
                                            )}
                                            <Badge
                                              variant="outline"
                                              className={
                                                po.status === 'received'
                                                  ? 'border-green-400 text-green-700'
                                                  : po.status === 'cancelled'
                                                  ? 'border-red-400 text-red-700'
                                                  : 'border-orange-400 text-orange-700'
                                              }
                                            >
                                              {po.status}
                                            </Badge>
                                            <span className="text-sm font-medium">
                                              {po.vendor?.name || 'Unknown vendor'}
                                            </span>
                                          </div>
                                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {new Date(po.order_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            {po.notes && <span className="ml-2">· {po.notes}</span>}
                                          </div>
                                        </div>
                                        <div className="text-right ml-4">
                                          <div className="font-bold text-orange-700">
                                            ${po.price_per_unit.toFixed(2)}/{po.unit || info.material.unit}
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            qty {po.quantity}
                                          </div>
                                          {po.zoho_po_url && (
                                            <button
                                              className="text-xs text-blue-600 hover:underline flex items-center gap-0.5 mt-0.5"
                                              onClick={() => window.open(po.zoho_po_url!, '_blank')}
                                            >
                                              <ExternalLink className="w-3 h-3" />
                                              Zoho Books
                                            </button>
                                          )}
                                        </div>
                                        {/* Mark as received */}
                                        {po.status === 'ordered' && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="ml-3 border-green-400 text-green-700 hover:bg-green-50 text-xs h-7"
                                            onClick={async () => {
                                              const { error } = await supabase
                                                .from('lumber_purchase_orders')
                                                .update({ status: 'received' })
                                                .eq('id', po.id);
                                              if (error) {
                                                toast.error('Failed to update PO status');
                                              } else {
                                                toast.success('PO marked as received');
                                                await loadPurchaseOrders();
                                              }
                                            }}
                                          >
                                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                            Received
                                          </Button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
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

      {/* Vendor Pricing Dialog */}
      <Dialog open={showVendorPricingDialog} onOpenChange={setShowVendorPricingDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Enter Prices for {selectedVendor?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Effective Date</Label>
              <Input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="text-left p-3">Material</th>
                    {category === 'lumber' && <th className="text-left p-3">MBF Price</th>}
                    <th className="text-left p-3">Price/Piece</th>
                    <th className="text-left p-3">Units</th>
                    <th className="text-left p-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredMaterials.map(material => {
                    const boardFeet = category === 'lumber' && material.unit === 'board foot'
                      ? calculateBoardFeet(material.name, material.standard_length)
                      : null;
                    return (
                      <tr key={material.id}>
                        <td className="p-3">
                          <div className="font-medium">{material.name}</div>
                          {boardFeet && (
                            <div className="text-xs text-muted-foreground">
                              {boardFeet.toFixed(2)} BF/piece
                            </div>
                          )}
                        </td>
                        {category === 'lumber' && (
                          <td className="p-3">
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={bulkPrices[material.id]?.mbf || ''}
                              onChange={(e) => updateBulkPrice(material.id, 'mbf', e.target.value)}
                            />
                          </td>
                        )}
                        <td className="p-3">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={bulkPrices[material.id]?.perUnit || ''}
                            onChange={(e) => updateBulkPrice(material.id, 'perUnit', e.target.value)}
                            readOnly={category === 'lumber' && !!(boardFeet && bulkPrices[material.id]?.mbf)}
                            className={category === 'lumber' && boardFeet && bulkPrices[material.id]?.mbf ? 'bg-slate-50' : ''}
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            placeholder="Units"
                            value={bulkPrices[material.id]?.truckload || ''}
                            onChange={(e) => updateBulkPrice(material.id, 'truckload', e.target.value)}
                          />
                        </td>
                        <td className="p-3">
                          <Input
                            placeholder="Notes"
                            value={bulkPrices[material.id]?.notes || ''}
                            onChange={(e) => updateBulkPrice(material.id, 'notes', e.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowVendorPricingDialog(false)}>
                Cancel
              </Button>
              <Button onClick={saveBulkPrices}>
                <DollarSign className="w-4 h-4 mr-2" />
                Save Prices
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vendor History Dialog */}
      <Dialog open={showVendorHistoryDialog} onOpenChange={setShowVendorHistoryDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Submission History - {historyVendor?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {historyVendor && getVendorSubmissionHistory(historyVendor.id).map((submission, idx) => {
              // Group entries by shipment color
              const colorGroups: Record<string, typeof submission.entries> = {};
              const noColorEntries: typeof submission.entries = [];
              
              submission.entries.forEach(entry => {
                if (entry.shipment_group_color) {
                  if (!colorGroups[entry.shipment_group_color]) {
                    colorGroups[entry.shipment_group_color] = [];
                  }
                  colorGroups[entry.shipment_group_color].push(entry);
                } else {
                  noColorEntries.push(entry);
                }
              });

              const colorClasses: Record<string, string> = {
                blue: 'bg-blue-100 border-blue-400',
                green: 'bg-green-100 border-green-400',
                orange: 'bg-orange-100 border-orange-400',
                purple: 'bg-purple-100 border-purple-400',
                red: 'bg-red-100 border-red-400',
                yellow: 'bg-yellow-100 border-yellow-400',
                pink: 'bg-pink-100 border-pink-400',
                teal: 'bg-teal-100 border-teal-400',
              };

              return (
                <div key={idx} className="border rounded-lg p-4 bg-slate-50">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="font-semibold text-lg">
                        {new Date(submission.submissionDate).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {submission.totalItems} materials submitted
                      </div>
                    </div>
                  </div>

                  {/* Shipment Color Groups */}
                  {Object.entries(colorGroups).map(([color, entries], groupIdx) => {
                    const colorClass = colorClasses[color] || 'bg-gray-100 border-gray-400';
                    return (
                      <div key={groupIdx} className={`mb-4 p-3 rounded-lg border-2 ${colorClass}`}>
                        <div className="flex items-center gap-2 mb-3">
                          <Truck className="w-4 h-4" />
                          <span className="font-semibold">
                            Combined Shipment Group {groupIdx + 1} ({color})
                          </span>
                          <Badge variant="secondary">{entries.length} materials</Badge>
                        </div>
                        <table className="w-full">
                          <thead className="text-xs bg-white/50">
                            <tr>
                              <th className="text-left p-2">Material</th>
                              {category === 'lumber' && <th className="text-left p-2">MBF Price</th>}
                              <th className="text-left p-2">Price/Piece</th>
                              <th className="text-left p-2">Units</th>
                              <th className="text-left p-2">Notes</th>
                            </tr>
                          </thead>
                          <tbody className="text-sm">
                            {entries.map(entry => {
                              const material = materials.find(m => m.id === entry.material_id);
                              return (
                                <tr key={entry.id} className="border-t">
                                  <td className="p-2 font-medium">{material?.name}</td>
                                  {category === 'lumber' && (
                                    <td className="p-2">
                                      {entry.mbf_price ? `$${entry.mbf_price.toFixed(2)}` : '-'}
                                    </td>
                                  )}
                                  <td className="p-2 font-semibold text-green-700">
                                    ${entry.price_per_unit.toFixed(2)}
                                  </td>
                                  <td className="p-2">
                                    {entry.truckload_quantity || '-'}
                                  </td>
                                  <td className="p-2 text-xs text-muted-foreground">
                                    {entry.notes || '-'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}

                  {/* Individual Materials (No Color) */}
                  {noColorEntries.length > 0 && (
                    <div className="bg-white rounded-lg border">
                      <table className="w-full">
                        <thead className="text-xs bg-slate-100">
                          <tr>
                            <th className="text-left p-2">Material</th>
                            {category === 'lumber' && <th className="text-left p-2">MBF Price</th>}
                            <th className="text-left p-2">Price/Piece</th>
                            <th className="text-left p-2">Units</th>
                            <th className="text-left p-2">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm">
                          {noColorEntries.map(entry => {
                            const material = materials.find(m => m.id === entry.material_id);
                            return (
                              <tr key={entry.id} className="border-t">
                                <td className="p-2 font-medium">{material?.name}</td>
                                {category === 'lumber' && (
                                  <td className="p-2">
                                    {entry.mbf_price ? `$${entry.mbf_price.toFixed(2)}` : '-'}
                                  </td>
                                )}
                                <td className="p-2 font-semibold text-green-700">
                                  ${entry.price_per_unit.toFixed(2)}
                                </td>
                                <td className="p-2">
                                  {entry.truckload_quantity || '-'}
                                </td>
                                <td className="p-2 text-xs text-muted-foreground">
                                  {entry.notes || '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Link Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5" />
              Share Pricing Link - {shareVendor?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {generatingLink ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
                <p className="text-muted-foreground">Generating shareable link...</p>
              </div>
            ) : shareLink ? (
              <>
                <div>
                  <Label>Shareable Link</Label>
                  <div className="flex gap-2 mt-2">
                    <Input value={shareLink} readOnly className="font-mono text-sm" />
                    <Button onClick={copyToClipboard} size="icon">
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => window.open(shareLink, '_blank')}
                      size="icon"
                      variant="outline"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    ✅ Link created successfully! Share this link with {shareVendor?.name} to submit their pricing.
                  </p>
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Settings
            </DialogTitle>
          </DialogHeader>
          <Tabs value={settingsTab} onValueChange={(v) => setSettingsTab(v as 'materials' | 'vendors')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="materials">Materials</TabsTrigger>
              <TabsTrigger value="vendors">Vendors</TabsTrigger>
            </TabsList>
            <TabsContent value="materials" className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Add/Edit Material</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Material Name</Label>
                    <Input
                      value={materialForm.name}
                      onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })}
                      placeholder="2x4 SPF"
                    />
                  </div>
                  <div>
                    <Label>Unit</Label>
                    <Select
                      value={materialForm.unit}
                      onValueChange={(v) => setMaterialForm({ ...materialForm, unit: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="board foot">Board Foot</SelectItem>
                        <SelectItem value="linear foot">Linear Foot</SelectItem>
                        <SelectItem value="piece">Piece</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Standard Length (ft)</Label>
                    <Input
                      type="number"
                      value={materialForm.standard_length}
                      onChange={(e) => setMaterialForm({ ...materialForm, standard_length: parseInt(e.target.value) || 16 })}
                    />
                  </div>
                  <div>
                    <Label>SKU (Zoho Books item code)</Label>
                    <Input
                      value={materialForm.sku}
                      onChange={(e) => setMaterialForm({ ...materialForm, sku: e.target.value })}
                      placeholder="e.g. LBR-2x4-16"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={saveMaterial} className="w-full">
                      {editingMaterial ? 'Update' : 'Add'} Material
                    </Button>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Existing Materials</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredMaterials.map(material => (
                    <div key={material.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <div className="font-medium">{material.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {material.unit} • {material.standard_length}ft
                          {material.sku && <span className="ml-2 text-blue-600">SKU: {material.sku}</span>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openMaterialForm(material)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600"
                          onClick={() => deleteMaterial(material)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
            <TabsContent value="vendors" className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Add/Edit Vendor</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Vendor Name</Label>
                    <Input
                      value={vendorForm.name}
                      onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
                      placeholder="Tri-State Lumber"
                    />
                  </div>
                  <div>
                    <Label>Contact Name</Label>
                    <Input
                      value={vendorForm.contact_name}
                      onChange={(e) => setVendorForm({ ...vendorForm, contact_name: e.target.value })}
                      placeholder="John Smith"
                    />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={vendorForm.phone}
                      onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                      placeholder="555-1234"
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      value={vendorForm.email}
                      onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })}
                      placeholder="contact@vendor.com"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Logo URL</Label>
                    <Input
                      value={vendorForm.logo_url}
                      onChange={(e) => setVendorForm({ ...vendorForm, logo_url: e.target.value })}
                      placeholder="https://example.com/logo.png"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button onClick={saveVendor} className="w-full">
                      {editingVendor ? 'Update' : 'Add'} Vendor
                    </Button>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Existing Vendors</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {vendors.map(vendor => (
                    <div key={vendor.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        {vendor.logo_url && (
                          <img src={vendor.logo_url} alt={vendor.name} className="h-8 w-auto" />
                        )}
                        <div>
                          <div className="font-medium">{vendor.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {vendor.contact_name || 'No contact'}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openVendorForm(vendor)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600"
                          onClick={() => deleteVendor(vendor)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Purchase Order Dialog */}
      {poMaterial && poVendor && (
        <LumberPurchaseOrderDialog
          open={showPODialog}
          onOpenChange={setShowPODialog}
          material={poMaterial}
          vendor={poVendor}
          defaultPrice={poDefaultPrice}
          onCreated={(po) => {
            setPurchaseOrders(prev => [po, ...prev]);
          }}
        />
      )}
    </div>
  );
}
