import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LumberRebarPricing } from './LumberRebarPricing';
import { LumberAnalytics } from './LumberAnalytics';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ChevronDown,
  ChevronRight,
  Search,
  Upload,
  Package,
  DollarSign,
  Tag,
  FileText,
  Download,
  Settings,
  Plus,
  Pencil,
  Trash2,
  Users,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface MaterialCatalogItem {
  sku: string;
  material_name: string;
  category: string | null;
  unit_price: number | null;
  purchase_cost: number | null;
  part_length: string | null;
  raw_metadata: any;
  displayName?: string;
}

interface LumberRebarMaterial {
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
  active: boolean;
  created_at: string;
}

export function MaterialInventory() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'catalog' | 'lumber' | 'rebar' | 'analytics'>('catalog');
  const [materials, setMaterials] = useState<MaterialCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<'add' | 'replace'>('replace');
  const [exporting, setExporting] = useState(false);
  
  // Settings dialog states
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'materials' | 'vendors'>('materials');
  const [lumberRebarMaterials, setLumberRebarMaterials] = useState<LumberRebarMaterial[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [editingMaterial, setEditingMaterial] = useState<LumberRebarMaterial | null>(null);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  
  // Material form states
  const [materialName, setMaterialName] = useState('');
  const [materialCategory, setMaterialCategory] = useState<'lumber' | 'rebar'>('lumber');
  const [materialUnit, setMaterialUnit] = useState('board foot');
  const [standardLength, setStandardLength] = useState('16');
  
  // Vendor form states
  const [vendorName, setVendorName] = useState('');
  const [vendorContact, setVendorContact] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [vendorEmail, setVendorEmail] = useState('');
  
  // Zoho sync states
  const [syncingZoho, setSyncingZoho] = useState(false);
  const [showSyncResults, setShowSyncResults] = useState(false);
  const [syncResults, setSyncResults] = useState<any>(null);

  useEffect(() => {
    loadMaterials();
    loadLumberRebarMaterials();
    loadVendors();
  }, []);

  async function loadMaterials() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('*')
        .order('material_name', { ascending: true });

      if (error) throw error;
      setMaterials(data || []);
    } catch (error: any) {
      console.error('Error loading materials:', error);
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  }

  async function syncMaterialsFromZoho() {
    setSyncingZoho(true);
    
    try {
      console.log('🔄 Starting Zoho Books material sync...');
      
      const { data, error } = await supabase.functions.invoke('zoho-sync', {
        body: { action: 'sync_materials' },
      });

      if (error) throw error;

      console.log('✅ Sync completed:', data);
      
      setSyncResults(data);
      setShowSyncResults(true);
      
      // Reload materials to show updated data
      await loadMaterials();
      
      toast.success(`✅ Synced ${data.itemsSynced || 0} materials from Zoho Books`);
    } catch (error: any) {
      console.error('❌ Sync error:', error);
      toast.error(`Failed to sync materials: ${error.message || 'Unknown error'}`);
    } finally {
      setSyncingZoho(false);
    }
  }

  async function loadLumberRebarMaterials() {
    try {
      const { data, error } = await supabase
        .from('lumber_rebar_materials')
        .select('*')
        .eq('active', true)
        .order('category', { ascending: true })
        .order('order_index', { ascending: true });

      if (error) throw error;
      setLumberRebarMaterials(data || []);
    } catch (error: any) {
      console.error('Error loading lumber/rebar materials:', error);
    }
  }

  async function loadVendors() {
    try {
      const { data, error } = await supabase
        .from('lumber_rebar_vendors')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      setVendors(data || []);
    } catch (error: any) {
      console.error('Error loading vendors:', error);
    }
  }

  function openMaterialForm(material?: LumberRebarMaterial) {
    if (material) {
      setEditingMaterial(material);
      setMaterialName(material.name);
      setMaterialCategory(material.category as 'lumber' | 'rebar');
      setMaterialUnit(material.unit);
      setStandardLength(material.standard_length.toString());
    } else {
      setEditingMaterial(null);
      setMaterialName('');
      setMaterialCategory('lumber');
      setMaterialUnit('board foot');
      setStandardLength('16');
    }
  }

  function openVendorForm(vendor?: Vendor) {
    if (vendor) {
      setEditingVendor(vendor);
      setVendorName(vendor.name);
      setVendorContact(vendor.contact_name || '');
      setVendorPhone(vendor.phone || '');
      setVendorEmail(vendor.email || '');
    } else {
      setEditingVendor(null);
      setVendorName('');
      setVendorContact('');
      setVendorPhone('');
      setVendorEmail('');
    }
  }

  async function saveMaterial() {
    if (!materialName) {
      toast.error('Material name is required');
      return;
    }

    try {
      if (editingMaterial) {
        // Update existing material
        const { error } = await supabase
          .from('lumber_rebar_materials')
          .update({
            name: materialName,
            category: materialCategory,
            unit: materialUnit,
            standard_length: parseFloat(standardLength),
          })
          .eq('id', editingMaterial.id);

        if (error) throw error;
        toast.success('Material updated successfully');
      } else {
        // Create new material
        const maxOrder = lumberRebarMaterials
          .filter(m => m.category === materialCategory)
          .reduce((max, m) => Math.max(max, m.order_index), 0);

        const { error } = await supabase
          .from('lumber_rebar_materials')
          .insert([{
            name: materialName,
            category: materialCategory,
            unit: materialUnit,
            standard_length: parseFloat(standardLength),
            order_index: maxOrder + 1,
          }]);

        if (error) throw error;
        toast.success('Material added successfully');
      }

      await loadLumberRebarMaterials();
      openMaterialForm();
    } catch (error: any) {
      console.error('Error saving material:', error);
      toast.error('Failed to save material');
    }
  }

  async function deleteMaterial(materialId: string) {
    if (!confirm('Are you sure you want to delete this material?')) return;

    try {
      const { error } = await supabase
        .from('lumber_rebar_materials')
        .update({ active: false })
        .eq('id', materialId);

      if (error) throw error;
      toast.success('Material deleted successfully');
      await loadLumberRebarMaterials();
    } catch (error: any) {
      console.error('Error deleting material:', error);
      toast.error('Failed to delete material');
    }
  }

  async function saveVendor() {
    if (!vendorName) {
      toast.error('Vendor name is required');
      return;
    }

    try {
      if (editingVendor) {
        // Update existing vendor
        const { error } = await supabase
          .from('lumber_rebar_vendors')
          .update({
            name: vendorName,
            contact_name: vendorContact || null,
            phone: vendorPhone || null,
            email: vendorEmail || null,
          })
          .eq('id', editingVendor.id);

        if (error) throw error;
        toast.success('Vendor updated successfully');
      } else {
        // Create new vendor
        const { error } = await supabase
          .from('lumber_rebar_vendors')
          .insert([{
            name: vendorName,
            contact_name: vendorContact || null,
            phone: vendorPhone || null,
            email: vendorEmail || null,
          }]);

        if (error) throw error;
        toast.success('Vendor added successfully');
      }

      await loadVendors();
      openVendorForm();
    } catch (error: any) {
      console.error('Error saving vendor:', error);
      toast.error('Failed to save vendor');
    }
  }

  async function deleteVendor(vendorId: string) {
    if (!confirm('Are you sure you want to delete this vendor?')) return;

    try {
      const { error } = await supabase
        .from('lumber_rebar_vendors')
        .update({ active: false })
        .eq('id', vendorId);

      if (error) throw error;
      toast.success('Vendor deleted successfully');
      await loadVendors();
    } catch (error: any) {
      console.error('Error deleting vendor:', error);
      toast.error('Failed to delete vendor');
    }
  }

  // Flatten materials - no grouping
  const flatMaterials = useMemo(() => {
    return materials.map(material => ({
      ...material,
      displayName: material.part_length 
        ? `${material.material_name} : ${material.part_length}`
        : material.material_name
    }));
  }, [materials]);

  // Get unique categories with cleaned names from Account column
  const categories = useMemo(() => {
    const cats = new Set<string>();
    flatMaterials.forEach(m => {
      if (m.category) {
        // Remove USD prefix and Sales text, clean up the category name
        const cleaned = m.category
          .replace(/^USD\s*[-:]?\s*/i, '')  // Remove USD prefix
          .replace(/Sales\s*[-:]?\s*/gi, '') // Remove Sales text
          .replace(/^[-:]\s*/, '')           // Remove leading dash/colon
          .trim();
        // Only add if it's not empty and NOT a number (integer or decimal)
        // Exclude anything that looks like a number: 123, 0.15, 1.24, etc.
        if (cleaned && !/^[\d\$,.\s]+$/.test(cleaned)) {
          cats.add(cleaned);
        }
      }
    });
    return Array.from(cats).sort();
  }, [flatMaterials]);

  // Helper to clean category name for display
  const cleanCategory = (category: string | null): string | null => {
    if (!category) return null;
    return category
      .replace(/^USD\s*[-:]?\s*/i, '')
      .replace(/Sales\s*[-:]?\s*/gi, '')
      .replace(/^[-:]\s*/, '')
      .trim() || null;
  };

  // Format length with feet and inches notation
  const formatLength = (length: string | null, category: string | null): string => {
    if (!length) return '';
    
    // Handle already formatted lengths (e.g., "12' 6\"")
    if (length.includes("'") || length.includes('"')) {
      return length;
    }
    
    // Parse various formats: "12.5", "12 6", "12-6", etc.
    const cleaned = length.trim();
    const cleanedCategory = cleanCategory(category);
    
    // For fasteners, treat numbers as inches
    if (cleanedCategory === 'Fastener') {
      const num = parseFloat(cleaned);
      if (!isNaN(num)) {
        // Display as inches with proper formatting
        if (num === Math.floor(num)) {
          return `${Math.floor(num)}"`;
        } else {
          // Convert decimal to fraction for common values
          const whole = Math.floor(num);
          const decimal = num - whole;
          
          // Common fractions
          if (Math.abs(decimal - 0.25) < 0.01) return whole > 0 ? `${whole} 1/4"` : `1/4"`;
          if (Math.abs(decimal - 0.5) < 0.01) return whole > 0 ? `${whole} 1/2"` : `1/2"`;
          if (Math.abs(decimal - 0.75) < 0.01) return whole > 0 ? `${whole} 3/4"` : `3/4"`;
          if (Math.abs(decimal - 0.125) < 0.01) return whole > 0 ? `${whole} 1/8"` : `1/8"`;
          if (Math.abs(decimal - 0.375) < 0.01) return whole > 0 ? `${whole} 3/8"` : `3/8"`;
          if (Math.abs(decimal - 0.625) < 0.01) return whole > 0 ? `${whole} 5/8"` : `5/8"`;
          if (Math.abs(decimal - 0.875) < 0.01) return whole > 0 ? `${whole} 7/8"` : `7/8"`;
          
          // If not a common fraction, just show decimal
          return `${num}"`;
        }
      }
      // If we can't parse it, return as-is with inch mark
      return length.includes('"') ? length : `${length}"`;
    }
    
    // For non-fasteners, treat as feet/inches
    // Try to parse as decimal (e.g., "12.5" -> 12' 6")
    if (cleaned.includes('.')) {
      const feet = Math.floor(parseFloat(cleaned));
      const inches = Math.round((parseFloat(cleaned) - feet) * 12);
      if (inches === 0) {
        return `${feet}'`;
      }
      return `${feet}' ${inches}"`;
    }
    
    // Try to parse as "feet inches" or "feet-inches"
    const parts = cleaned.split(/[\s-]+/);
    if (parts.length === 2) {
      const feet = parseInt(parts[0]);
      const inches = parseInt(parts[1]);
      if (!isNaN(feet) && !isNaN(inches)) {
        if (inches === 0) {
          return `${feet}'`;
        }
        return `${feet}' ${inches}"`;
      }
    }
    
    // Single number - assume it's feet
    const num = parseFloat(cleaned);
    if (!isNaN(num)) {
      const feet = Math.floor(num);
      const inches = Math.round((num - feet) * 12);
      if (inches === 0) {
        return `${feet}'`;
      }
      return `${feet}' ${inches}"`;
    }
    
    // If we can't parse it, return as-is
    return length;
  };

  // Filter materials
  const filteredMaterials = useMemo(() => {
    let filtered = flatMaterials;

    // Filter by category (compare cleaned names)
    if (selectedCategory) {
      filtered = filtered.filter(m => cleanCategory(m.category) === selectedCategory);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(m =>
        m.material_name.toLowerCase().includes(term) ||
        m.sku.toLowerCase().includes(term) ||
        m.part_length?.toLowerCase().includes(term)
      );
    }

    // Sort by name then length
    return filtered.sort((a, b) => {
      const nameCompare = a.material_name.localeCompare(b.material_name);
      if (nameCompare !== 0) return nameCompare;
      return (a.part_length || '').localeCompare(b.part_length || '');
    });
  }, [flatMaterials, selectedCategory, searchTerm]);



  // Enhanced CSV parser that handles quoted values
  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  async function handleImportCSV() {
    if (!importFile) {
      toast.error('Please select a file');
      return;
    }

    try {
      setImporting(true);

      // STEP 1: If replace mode, clear all existing materials
      if (importMode === 'replace') {
        console.log('🗑️ Clearing all existing materials...');
        const { error: deleteError } = await supabase
          .from('materials_catalog')
          .delete()
          .neq('sku', ''); // Delete all (neq empty string matches all)

        if (deleteError) {
          console.error('Delete error:', deleteError);
          throw new Error(`Failed to clear existing materials: ${deleteError.message}`);
        }
        
        toast.info('Existing catalog cleared, importing new data...');
      }

      // STEP 2: Parse and import the CSV
      const text = await importFile.text();
      const lines = text.split('\n').filter(line => line.trim());
      const headers = parseCSVLine(lines[0]).map(h => h.replace(/"/g, '').trim());

      console.log('CSV Headers found:', headers);

      // Find column indices - try multiple variations
      const itemNameIdx = headers.findIndex(h => 
        h.toLowerCase().includes('item') && h.toLowerCase().includes('name')
      );
      const skuIdx = headers.findIndex(h => h.toLowerCase() === 'sku');
      const rateIdx = headers.findIndex(h => h.toLowerCase() === 'rate');
      const purchaseRateIdx = headers.findIndex(h => 
        h.toLowerCase().includes('purchase') && h.toLowerCase().includes('rate')
      );
      const accountIdx = headers.findIndex(h => h.toLowerCase() === 'account');
      const partLengthIdx = headers.findIndex(h => 
        h.toLowerCase().includes('cf.part') && h.toLowerCase().includes('length')
      );

      console.log('Column indices:', { itemNameIdx, skuIdx, rateIdx, purchaseRateIdx, accountIdx, partLengthIdx });

      if (itemNameIdx === -1 || skuIdx === -1) {
        throw new Error(`Required columns not found. Found headers: ${headers.join(', ')}`);
      }

      // Group by SKU to handle duplicates (color variants, etc.)
      const materialsBySku = new Map<string, any>();
      let totalRows = 0;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV line with proper quote handling
        const values = parseCSVLine(line).map(v => v.replace(/"/g, '').trim());
        
        const itemName = values[itemNameIdx];
        const sku = values[skuIdx];
        
        if (!itemName || !sku) continue;

        totalRows++;

        // Helper to parse price values with various formats
        const parsePrice = (value: string): number => {
          if (!value) return 0;
          // Remove USD prefix, dollar signs, commas, and whitespace
          const cleaned = value
            .replace(/USD\s*/i, '')
            .replace(/\$/g, '')
            .replace(/,/g, '')
            .trim();
          const parsed = parseFloat(cleaned);
          return isNaN(parsed) ? 0 : parsed;
        };

        // Get category and cost from Account column
        // Account column can contain either:
        // - Text (category name like "Fastener") → use as category
        // - Number (cost like "0.15") → use as purchase_cost
        const accountValue = accountIdx !== -1 ? values[accountIdx] : null;
        let category: string | null = null;
        let costFromAccount: number = 0;
        
        if (accountValue) {
          const trimmed = accountValue.trim();
          // Check if it's a pure number (with optional $ and commas)
          const asNumber = parsePrice(trimmed);
          if (asNumber > 0 && /^[\d\$,.\s]+$/.test(trimmed)) {
            // It's a number - use it as cost
            costFromAccount = asNumber;
            // Category will be null - could be inferred from item name if needed
          } else {
            // It's text - use it as category
            category = accountValue;
          }
        }

        // Debug first row
        if (totalRows === 1) {
          console.log('First row sample:', {
            itemName,
            sku,
            rate: values[rateIdx],
            purchaseRate: values[purchaseRateIdx],
            account: accountValue,
            accountIsNumber: costFromAccount > 0,
            partLength: partLengthIdx !== -1 ? values[partLengthIdx] : 'N/A'
          });
        }

        // Create raw metadata object with ALL columns for this row
        const rowMetadata: any = {};
        headers.forEach((header, idx) => {
          rowMetadata[header] = values[idx] || '';
        });

        // If this SKU already exists, add to the metadata array
        if (materialsBySku.has(sku)) {
          const existing = materialsBySku.get(sku);
          // Add this row's metadata to the array
          existing.raw_metadata.push(rowMetadata);
        } else {
          // Get length from CF.Part Length column
          const partLength = partLengthIdx !== -1 ? values[partLengthIdx] : null;

          // Get purchase cost - prioritize Account column if it has a number, otherwise use Purchase Rate
          const purchaseRateCost = purchaseRateIdx !== -1 ? parsePrice(values[purchaseRateIdx]) : 0;
          const purchaseCost = costFromAccount > 0 ? costFromAccount : purchaseRateCost;

          // Create new entry with metadata as an array
          materialsBySku.set(sku, {
            sku: sku,
            material_name: itemName,
            category: category, // Only text from Account column, never numbers
            unit_price: rateIdx !== -1 ? parsePrice(values[rateIdx]) : 0,
            purchase_cost: purchaseCost, // From Purchase Rate column only
            part_length: partLength,
            raw_metadata: [rowMetadata], // Store as array to preserve all variants
          });
        }
      }

      // Convert to array of unique materials
      const materialsToInsert = Array.from(materialsBySku.values());

      // Insert in batches of 500
      const batchSize = 500;
      for (let i = 0; i < materialsToInsert.length; i += batchSize) {
        const batch = materialsToInsert.slice(i, i + batchSize);
        
        if (importMode === 'replace') {
          // In replace mode, use insert (no upsert needed since we cleared everything)
          const { error } = await supabase
            .from('materials_catalog')
            .insert(batch);

          if (error) throw error;
        } else {
          // In add mode, use upsert to update existing SKUs
          const { error } = await supabase
            .from('materials_catalog')
            .upsert(batch, { onConflict: 'sku' });

          if (error) throw error;
        }
      }

      const successMessage = importMode === 'replace'
        ? `✅ Replaced catalog with ${materialsToInsert.length} unique materials from ${totalRows} rows`
        : `✅ Added/updated ${materialsToInsert.length} unique materials from ${totalRows} rows`;
      
      toast.success(successMessage);
      setShowImportDialog(false);
      setImportFile(null);
      setImportMode('replace'); // Reset to default
      loadMaterials();
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
    }
  }

  const totalItems = materials.length;
  
  async function exportMaterialsCatalog() {
    setExporting(true);

    try {
      if (materials.length === 0) {
        toast.error('No materials to export');
        return;
      }

      // Status labels
      const STATUS_LABELS: Record<string, string> = {
        needed: 'Needed',
        not_ordered: 'Not Ordered',
        ordered: 'Ordered',
        at_shop: 'At Shop',
        ready_to_pull: 'Pull from Shop',
        at_job: 'At Job',
        installed: 'Installed',
        missing: 'Missing',
      };

      // Create CSV headers
      const headers = [
        'Material Name',
        'SKU',
        'Category',
        'Length',
        'Purchase Cost',
        'Unit Price',
        'Markup %',
      ];

      const csvRows = [headers.join(',')];

      // Helper function to escape CSV values
      const escapeCSV = (str: string | null | undefined): string => {
        if (!str) return '';
        const text = String(str);
        if (text.includes(',') || text.includes('"') || text.includes('\n')) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      };

      // Add each material as a row
      materials.forEach((material) => {
        const purchaseCost = material.purchase_cost || 0;
        const unitPrice = material.unit_price || 0;
        const markup = purchaseCost > 0 ? ((unitPrice - purchaseCost) / purchaseCost) * 100 : 0;

        const row = [
          escapeCSV(material.material_name),
          escapeCSV(material.sku),
          escapeCSV(cleanCategory(material.category)),
          escapeCSV(formatLength(material.part_length, material.category)),
          purchaseCost.toFixed(2),
          unitPrice.toFixed(2),
          markup.toFixed(1),
        ];
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Materials_Catalog_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${materials.length} materials to CSV`);
    } catch (error: any) {
      console.error('Error exporting materials:', error);
      toast.error('Failed to export materials catalog');
    } finally {
      setExporting(false);
    }
  }
  
  // Helper function to calculate markup and determine color
  const getMarkupDisplay = (cost: number | null, price: number | null) => {
    if (!cost || cost === 0 || !price) {
      return { markup: 0, color: 'text-slate-400', bgColor: 'bg-slate-100' };
    }
    
    const markup = ((price - cost) / cost) * 100;
    
    // Only highlight negative markups in red
    if (markup < 0) {
      return { markup, color: 'text-red-700 font-bold', bgColor: 'bg-red-50' };
    } else {
      return { markup, color: 'text-black', bgColor: 'bg-transparent' };
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-50 animate-pulse" />
          <p className="text-muted-foreground">Loading materials catalog...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between gap-3">
          <TabsList className="bg-transparent gap-3 h-auto p-0">
            <TabsTrigger 
              value="catalog" 
              className="border-2 border-slate-300 bg-white data-[state=active]:bg-yellow-500 data-[state=active]:text-black data-[state=active]:border-yellow-600 text-slate-700 hover:bg-slate-50 px-6 py-3 rounded-lg font-semibold shadow-sm"
            >
              Material Catalog
            </TabsTrigger>
            <TabsTrigger 
              value="lumber" 
              className="border-2 border-slate-300 bg-white data-[state=active]:bg-yellow-500 data-[state=active]:text-black data-[state=active]:border-yellow-600 text-slate-700 hover:bg-slate-50 px-6 py-3 rounded-lg font-semibold shadow-sm"
            >
              Lumber Pricing
            </TabsTrigger>
            <TabsTrigger 
              value="rebar" 
              className="border-2 border-slate-300 bg-white data-[state=active]:bg-yellow-500 data-[state=active]:text-black data-[state=active]:border-yellow-600 text-slate-700 hover:bg-slate-50 px-6 py-3 rounded-lg font-semibold shadow-sm"
            >
              Rebar Pricing
            </TabsTrigger>
            <TabsTrigger 
              value="analytics" 
              className="border-2 border-slate-300 bg-white data-[state=active]:bg-yellow-500 data-[state=active]:text-black data-[state=active]:border-yellow-600 text-slate-700 hover:bg-slate-50 px-6 py-3 rounded-lg font-semibold shadow-sm"
            >
              Analytics
            </TabsTrigger>
          </TabsList>
          
          {/* Settings Button - Only show on lumber, rebar, and analytics tabs */}
          {(activeTab === 'lumber' || activeTab === 'rebar' || activeTab === 'analytics') && (
            <Button
              onClick={() => setShowSettingsDialog(true)}
              className="bg-slate-700 hover:bg-slate-800 text-white"
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          )}
        </div>

        <TabsContent value="lumber" className="space-y-4">
          <LumberRebarPricing category="lumber" />
        </TabsContent>

        <TabsContent value="rebar" className="space-y-4">
          <LumberRebarPricing category="rebar" />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <LumberAnalytics />
        </TabsContent>

        <TabsContent value="catalog" className="space-y-6">
      {/* Category Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex items-center gap-1 overflow-x-auto pb-0">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-6 py-3 font-medium text-sm whitespace-nowrap border-b-2 transition-colors ${
              selectedCategory === null
                ? 'border-blue-600 text-blue-600 bg-blue-50'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            All Materials
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-6 py-3 font-medium text-sm whitespace-nowrap border-b-2 transition-colors ${
                selectedCategory === cat
                  ? 'border-blue-600 text-blue-600 bg-blue-50'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Search and Import Button */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search materials by name, SKU, or length..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="text-sm text-slate-600 px-3 py-2 bg-slate-100 rounded border border-slate-200 flex-shrink-0">
          <span className="font-medium">{filteredMaterials.length.toLocaleString()}</span>
          <span className="text-slate-500 ml-1">materials</span>
        </div>
        <Button
          onClick={syncMaterialsFromZoho}
          disabled={syncingZoho}
          variant="outline"
          className="border-purple-500 text-purple-700 hover:bg-purple-50 flex-shrink-0"
          title="Sync materials from Zoho Books"
        >
          {syncingZoho ? (
            <>
              <div className="w-4 h-4 border-2 border-purple-700 border-t-transparent rounded-full animate-spin mr-2" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Sync Zoho
            </>
          )}
        </Button>
        <Button
          onClick={exportMaterialsCatalog}
          disabled={exporting || materials.length === 0}
          variant="outline"
          className="flex-shrink-0"
        >
          {exporting ? (
            <>
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </>
          )}
        </Button>
        <Button
          onClick={() => setShowImportDialog(true)}
          className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white shadow-lg flex-shrink-0"
        >
          <Upload className="w-4 h-4 mr-2" />
          Import CSV
        </Button>
      </div>

      {/* Materials List */}
      <Card>
        <CardContent className="p-0 max-h-[calc(100vh-300px)] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
              <TableRow className="border-b-2 border-slate-200">
                <TableHead className="bg-slate-50 font-bold">Material Name</TableHead>
                <TableHead className="bg-slate-50 font-bold">Length</TableHead>
                <TableHead className="bg-slate-50 font-bold">SKU</TableHead>
                <TableHead className="bg-slate-50 font-bold">Category</TableHead>
                <TableHead className="text-right bg-slate-50 font-bold">Cost</TableHead>
                <TableHead className="text-right bg-slate-50 font-bold">Markup %</TableHead>
                <TableHead className="text-right bg-slate-50 font-bold">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMaterials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No materials found</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredMaterials.map(material => {
                  const markupDisplay = getMarkupDisplay(material.purchase_cost, material.unit_price);
                  
                  return (
                    <TableRow key={material.sku} className="hover:bg-slate-50 border-b border-slate-100">
                      <TableCell className="font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-slate-600" />
                          <span>{material.material_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-blue-700">
                        {formatLength(material.part_length, material.category)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Tag className="w-3 h-3 text-slate-500" />
                          <span className="text-sm font-mono text-slate-700">{material.sku}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {cleanCategory(material.category) && (
                          <Badge variant="outline" className="font-medium">{cleanCategory(material.category)}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-black">
                        ${(material.purchase_cost || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className={`text-right font-bold ${markupDisplay.color} ${markupDisplay.bgColor} rounded px-2`}>
                        {markupDisplay.markup.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right font-semibold text-black">
                        ${(material.unit_price || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Import Materials from CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Import Mode Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Import Mode</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setImportMode('replace')}
                  className={`p-4 border-2 rounded-lg text-left transition-all ${
                    importMode === 'replace'
                      ? 'border-blue-600 bg-blue-50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      importMode === 'replace' ? 'border-blue-600' : 'border-slate-300'
                    }`}>
                      {importMode === 'replace' && (
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-sm mb-1">Replace All Data</p>
                      <p className="text-xs text-muted-foreground">
                        Deletes all existing materials and imports fresh data from spreadsheet
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setImportMode('add')}
                  className={`p-4 border-2 rounded-lg text-left transition-all ${
                    importMode === 'add'
                      ? 'border-blue-600 bg-blue-50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      importMode === 'add' ? 'border-blue-600' : 'border-slate-300'
                    }`}>
                      {importMode === 'add' && (
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-sm mb-1">Add/Update Materials</p>
                      <p className="text-xs text-muted-foreground">
                        Keeps existing data and adds new materials or updates matching SKUs
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              {/* Warning for Replace Mode */}
              {importMode === 'replace' && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-3 flex gap-3">
                  <div className="text-amber-600 flex-shrink-0 mt-0.5">⚠️</div>
                  <div>
                    <p className="font-semibold text-sm text-amber-900 mb-1">
                      Warning: This will delete all {materials.length} existing materials
                    </p>
                    <p className="text-xs text-amber-800">
                      All current catalog data will be permanently removed and replaced with the uploaded spreadsheet. This cannot be undone.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">CSV File</Label>
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="csv-upload"
                />
                <label htmlFor="csv-upload" className="cursor-pointer">
                  <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="font-medium mb-2">
                    {importFile ? (
                      <span className="text-blue-600">📄 {importFile.name}</span>
                    ) : (
                      'Click to select CSV file'
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Required columns: Item Name, SKU, Rate, Purchase Rate, Account, CF.Part Length
                  </p>
                </label>
              </div>
            </div>

            {/* Expected Behavior */}
            <div className="bg-slate-50 border rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">The system will:</p>
              <ul className="text-xs text-slate-600 space-y-1 ml-4 list-disc">
                {importMode === 'replace' ? (
                  <>
                    <li>Delete all {materials.length} existing materials</li>
                    <li>Import fresh data from your spreadsheet</li>
                    <li>No duplicates - catalog will match spreadsheet exactly</li>
                  </>
                ) : (
                  <>
                    <li>Keep all existing materials</li>
                    <li>Add new materials from spreadsheet</li>
                    <li>Update existing materials if SKU matches</li>
                  </>
                )}
                <li>Group materials by Item Name</li>
                <li>Preserve all SKU variants with pricing</li>
                <li>Store complete metadata for future export</li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowImportDialog(false);
                  setImportFile(null);
                  setImportMode('replace');
                }}
                disabled={importing}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleImportCSV}
                disabled={!importFile || importing}
                className={`flex-1 ${importMode === 'replace' ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
              >
                {importing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    {importMode === 'replace' ? 'Replacing...' : 'Importing...'}
                  </>
                ) : (
                  <>
                    {importMode === 'replace' ? '🗑️ Replace All Data' : '➕ Add/Update Materials'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
        </TabsContent>
      </Tabs>

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Lumber & Rebar Settings
            </DialogTitle>
          </DialogHeader>

          <Tabs value={settingsTab} onValueChange={(v) => setSettingsTab(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="materials">Materials</TabsTrigger>
              <TabsTrigger value="vendors">Vendors</TabsTrigger>
            </TabsList>

            {/* Materials Tab */}
            <TabsContent value="materials" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Manage lumber and rebar materials
                </p>
                <Button onClick={() => openMaterialForm()} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Material
                </Button>
              </div>

              {/* Material Form */}
              {(editingMaterial !== null || materialName) && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Material Name *</Label>
                          <Input
                            value={materialName}
                            onChange={(e) => setMaterialName(e.target.value)}
                            placeholder="e.g., 2x4 SPF"
                          />
                        </div>
                        <div>
                          <Label>Category *</Label>
                          <Select value={materialCategory} onValueChange={(v) => setMaterialCategory(v as any)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="lumber">Lumber</SelectItem>
                              <SelectItem value="rebar">Rebar</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Unit *</Label>
                          <Select value={materialUnit} onValueChange={setMaterialUnit}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="board foot">Board Foot</SelectItem>
                              <SelectItem value="linear foot">Linear Foot</SelectItem>
                              <SelectItem value="sheet">Sheet</SelectItem>
                              <SelectItem value="piece">Piece</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Standard Length (ft)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            value={standardLength}
                            onChange={(e) => setStandardLength(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button onClick={saveMaterial}>
                          {editingMaterial ? 'Update Material' : 'Add Material'}
                        </Button>
                        <Button variant="outline" onClick={() => openMaterialForm()}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Materials List */}
              <div className="space-y-3">
                {['lumber', 'rebar'].map(cat => {
                  const categoryMaterials = lumberRebarMaterials.filter(m => m.category === cat);
                  if (categoryMaterials.length === 0) return null;

                  return (
                    <div key={cat}>
                      <h3 className="font-semibold text-sm text-slate-700 mb-2 uppercase">
                        {cat}
                      </h3>
                      <div className="space-y-2">
                        {categoryMaterials.map(material => (
                          <div
                            key={material.id}
                            className="flex items-center justify-between p-3 bg-white border rounded-lg hover:bg-slate-50"
                          >
                            <div>
                              <p className="font-medium">{material.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {material.standard_length}' • {material.unit}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openMaterialForm(material)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => deleteMaterial(material.id)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {/* Vendors Tab */}
            <TabsContent value="vendors" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Manage vendor contacts and information
                </p>
                <Button onClick={() => openVendorForm()} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Vendor
                </Button>
              </div>

              {/* Vendor Form */}
              {(editingVendor !== null || vendorName) && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div>
                        <Label>Vendor Name *</Label>
                        <Input
                          value={vendorName}
                          onChange={(e) => setVendorName(e.target.value)}
                          placeholder="e.g., ABC Lumber Supply"
                        />
                      </div>

                      <div>
                        <Label>Contact Name</Label>
                        <Input
                          value={vendorContact}
                          onChange={(e) => setVendorContact(e.target.value)}
                          placeholder="Primary contact person"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Phone</Label>
                          <Input
                            value={vendorPhone}
                            onChange={(e) => setVendorPhone(e.target.value)}
                            placeholder="(555) 123-4567"
                          />
                        </div>
                        <div>
                          <Label>Email</Label>
                          <Input
                            type="email"
                            value={vendorEmail}
                            onChange={(e) => setVendorEmail(e.target.value)}
                            placeholder="contact@vendor.com"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button onClick={saveVendor}>
                          {editingVendor ? 'Update Vendor' : 'Add Vendor'}
                        </Button>
                        <Button variant="outline" onClick={() => openVendorForm()}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Vendors List */}
              <div className="space-y-2">
                {vendors.map(vendor => (
                  <div
                    key={vendor.id}
                    className="flex items-center justify-between p-3 bg-white border rounded-lg hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-medium">{vendor.name}</p>
                      <div className="text-sm text-muted-foreground space-y-0.5">
                        {vendor.contact_name && <p>Contact: {vendor.contact_name}</p>}
                        {vendor.phone && <p>Phone: {vendor.phone}</p>}
                        {vendor.email && <p>Email: {vendor.email}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openVendorForm(vendor)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteVendor(vendor.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Zoho Sync Results Dialog */}
      <Dialog open={showSyncResults} onOpenChange={setShowSyncResults}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-green-600" />
              Zoho Books Sync Complete
            </DialogTitle>
          </DialogHeader>
          
          {syncResults && (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Total Synced</div>
                  <div className="text-2xl font-bold text-blue-700">{syncResults.itemsSynced || 0}</div>
                </div>
                <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">New Materials</div>
                  <div className="text-2xl font-bold text-green-700">{syncResults.itemsInserted || 0}</div>
                </div>
                <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Updated</div>
                  <div className="text-2xl font-bold text-orange-700">{syncResults.itemsUpdated || 0}</div>
                </div>
                <div className="bg-slate-50 border-2 border-slate-300 rounded-lg p-4">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Skipped</div>
                  <div className="text-2xl font-bold text-slate-700">{syncResults.itemsSkipped || 0}</div>
                </div>
              </div>

              {/* Success Message */}
              {syncResults.message && (
                <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold text-green-900 mb-1">Sync Summary</h4>
                      <p className="text-sm text-green-800">{syncResults.message}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Skipped Items Warning */}
              {syncResults.skippedItems && syncResults.skippedItems.length > 0 && (
                <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-yellow-900 mb-2">Skipped Materials (No SKU)</h4>
                      <p className="text-sm text-yellow-800 mb-3">
                        The following {syncResults.skippedItems.length} material{syncResults.skippedItems.length !== 1 ? 's were' : ' was'} skipped because they don't have a valid SKU in Zoho Books:
                      </p>
                      <div className="bg-white rounded border border-yellow-200 p-3 max-h-40 overflow-y-auto">
                        <ul className="text-sm space-y-1">
                          {syncResults.skippedItems.slice(0, 20).map((item: string, idx: number) => (
                            <li key={idx} className="flex items-center gap-2">
                              <X className="w-3 h-3 text-yellow-600 flex-shrink-0" />
                              <span className="text-yellow-900">{item}</span>
                            </li>
                          ))}
                          {syncResults.skippedItems.length > 20 && (
                            <li className="text-xs text-yellow-700 pt-2 border-t border-yellow-200">
                              ... and {syncResults.skippedItems.length - 20} more
                            </li>
                          )}
                        </ul>
                      </div>
                      <p className="text-xs text-yellow-700 mt-2">
                        💡 To sync these materials, add SKUs to them in Zoho Books and run the sync again.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* What Changed */}
              <div className="border-2 rounded-lg p-4">
                <h4 className="font-semibold text-slate-900 mb-3">What Changed?</h4>
                <div className="space-y-2 text-sm">
                  {syncResults.itemsInserted > 0 && (
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="w-4 h-4" />
                      <span><strong>{syncResults.itemsInserted}</strong> new material{syncResults.itemsInserted !== 1 ? 's' : ''} added to catalog</span>
                    </div>
                  )}
                  {syncResults.itemsUpdated > 0 && (
                    <div className="flex items-start gap-2 text-orange-700">
                      <RefreshCw className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <div><strong>{syncResults.itemsUpdated}</strong> material{syncResults.itemsUpdated !== 1 ? 's' : ''} updated with latest Zoho Books data</div>
                        <div className="text-xs text-orange-600 mt-1">
                          ℹ️ Updated fields: Name, Category, Prices (unit_price, purchase_cost), Length/Unit, and Metadata
                        </div>
                      </div>
                    </div>
                  )}
                  {syncResults.vendorsSynced > 0 && (
                    <div className="flex items-center gap-2 text-blue-700">
                      <CheckCircle className="w-4 h-4" />
                      <span><strong>{syncResults.vendorsSynced}</strong> vendor{syncResults.vendorsSynced !== 1 ? 's' : ''} synced</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-900">
                    <h5 className="font-semibold mb-1">Zoho Books is Now the Source of Truth</h5>
                    <p className="text-blue-800">
                      All material information (names, categories, prices, SKUs) has been updated to match Zoho Books. 
                      Any price changes or material updates in Zoho Books will be reflected here after syncing.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button onClick={() => setShowSyncResults(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
