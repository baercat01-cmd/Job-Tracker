import { useState, useEffect, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMaterialsToolbarSlot } from '@/contexts/JobDetailMaterialsToolbarContext';

// Module-level cache: survives component unmount/remount (e.g. tab switches).
// Key: `${jobId}:${quoteId|null}`, value: { workbook, categories, cachedAt }
interface WorkbookCacheEntry {
  workbook: any;
  categories: string[];
  cachedAt: number;
}
const workbookCache = new Map<string, WorkbookCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Edit,
  Trash2,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Upload,
  FileSpreadsheet,
  MoveHorizontal,
  Percent,
  Image as ImageIcon,
  Package,
  CheckSquare,
  Square,
  CheckCircle,
  ShoppingCart,
  FileText,
  RefreshCw,
  AlertCircle,
  MoreVertical,
  Download,
  ArrowUp,
  ArrowDown,
  ListOrdered,
  GripVertical,
  Pencil,
  Ruler,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@/types';
import { ExtrasManagement } from './ExtrasManagement';
import { OfficeCrewOrders } from './OfficeCrewOrders';
import { MaterialWorkbookManager } from './MaterialWorkbookManager';
import { MaterialItemPhotos } from './MaterialItemPhotos';
import { PhotoRecoveryTool } from './PhotoRecoveryTool';
import { MaterialPackages } from './MaterialPackages';
import { ZohoOrderConfirmationDialog } from './ZohoOrderConfirmationDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FloatingDocumentViewer } from './FloatingDocumentViewer';
import { getTotalInchesFromTrimConfig } from './TrimDrawingPreview';

interface MaterialItem {
  id: string;
  sheet_id: string;
  category: string;
  usage: string | null;
  sku: string | null;
  material_name: string;
  quantity: number;
  length: string | null;
  color: string | null;
  cost_per_unit: number | null;
  markup_percent: number | null;
  price_per_unit: number | null;
  extended_cost: number | null;
  extended_price: number | null;
  taxable: boolean;
  trim_saved_config_id?: string | null;
  notes: string | null;
  order_index: number;
  status: string;
  created_at: string;
  updated_at: string;
  sheets: {
    sheet_name: string;
  };
}

interface MaterialSheet {
  id: string;
  workbook_id: string;
  sheet_name: string;
  order_index: number;
  sheet_type?: 'proposal' | 'change_order';
  category_order: string[] | null;
  items: MaterialItem[];
  created_at: string;
}

interface MaterialWorkbook {
  id: string;
  job_id: string;
  version_number: number;
  status: 'working' | 'locked';
  sheets: MaterialSheet[];
}

interface JobQuote {
  id: string;
  proposal_number: string | null;
  quote_number: string | null;
  created_at: string;
  sent_at: string | null;
  locked_for_editing: boolean | null;
  is_change_order_proposal?: boolean;
}

interface MaterialsManagementProps {
  job: Job;
  userId: string;
  proposalNumber?: string | null;
  /** When provided, proposal selection is controlled by parent (e.g. combined Proposal+Materials view) */
  controlledQuoteId?: string | null;
  /** Called when user selects a different proposal in the dropdown */
  onQuoteChange?: (quoteId: string | null) => void;
}

interface CategoryGroup {
  category: string;
  items: MaterialItem[];
}

export function MaterialsManagement({ job, userId, proposalNumber, controlledQuoteId, onQuoteChange }: MaterialsManagementProps) {
  const [jobQuotes, setJobQuotes] = useState<JobQuote[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const isControlled = controlledQuoteId !== undefined;
  const effectiveQuoteId = isControlled ? controlledQuoteId : selectedQuoteId;
  const [workbook, setWorkbook] = useState<MaterialWorkbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'manage' | 'breakdown' | 'packages' | 'crew-orders' | 'trim-flatstock' | 'upload'>('manage');
  const [pendingCrewCount, setPendingCrewCount] = useState(0);
  const [activeSheetId, setActiveSheetId] = useState<string>('');
  const activeSheetIdRef = useRef<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [movingItem, setMovingItem] = useState<MaterialItem | null>(null);
  const [openPhotosForItem, setOpenPhotosForItem] = useState<{ id: string; materialName: string } | null>(null);
  const [moveToSheetId, setMoveToSheetId] = useState<string>('');
  const [moveToCategory, setMoveToCategory] = useState<string>('');
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [editingCell, setEditingCell] = useState<{ itemId: string; field: string } | null>(null);
  const [cellValue, setCellValue] = useState('');
  const scrollPositionRef = useRef<number>(0);

  // Keep ref in sync so loadWorkbook (called from realtime/subscription) always sees latest selection
  useEffect(() => {
    activeSheetIdRef.current = activeSheetId;
  }, [activeSheetId]);
  
  // Sheet type filter
  const [sheetTypeFilter, setSheetTypeFilter] = useState<'all' | 'proposal' | 'change_order'>('proposal');

  // Add material dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addToCategory, setAddToCategory] = useState<string>('');
  const [newMaterialName, setNewMaterialName] = useState('');
  const [newUsage, setNewUsage] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newQuantity, setNewQuantity] = useState('1');
  const [newLength, setNewLength] = useState('');
  const [newColor, setNewColor] = useState('');
  const [newCostPerUnit, setNewCostPerUnit] = useState('');
  const [newPricePerUnit, setNewPricePerUnit] = useState(''); // Price from Zoho Books
  const [newMarkup, setNewMarkup] = useState(''); // Display only - calculated from Zoho prices
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Database search state for add dialog
  const [showDatabaseSearch, setShowDatabaseSearch] = useState(false);
  const [addMaterialDialogMode, setAddMaterialDialogMode] = useState<'search' | 'custom'>('search');
  const [catalogMaterials, setCatalogMaterials] = useState<any[]>([]);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [catalogSearchCategory, setCatalogSearchCategory] = useState<string>('all');
  const [catalogSearchPage, setCatalogSearchPage] = useState(0);
  const [catalogCategories, setCatalogCategories] = useState<string[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [selectedCatalogMaterials, setSelectedCatalogMaterials] = useState<any[]>([]);
  const [addingCatalogBatch, setAddingCatalogBatch] = useState(false);
  const [catalogAddQuantity, setCatalogAddQuantity] = useState('1');
  const [catalogAddColor, setCatalogAddColor] = useState('');
  
  // Package state
  const [packages, setPackages] = useState<any[]>([]);
  
  // Package selection mode in workbook
  const [packageSelectionMode, setPackageSelectionMode] = useState(false);
  const [selectedMaterialsForPackageAdd, setSelectedMaterialsForPackageAdd] = useState<Set<string>>(new Set());
  const [showAddToPackageDialog, setShowAddToPackageDialog] = useState(false);
  const [targetPackageId, setTargetPackageId] = useState('');
  const [addingMaterialsToPackage, setAddingMaterialsToPackage] = useState(false);

  // Bulk move mode in workbook
  const [bulkMoveMode, setBulkMoveMode] = useState(false);
  const [selectedMaterialsForMove, setSelectedMaterialsForMove] = useState<Set<string>>(new Set());
  const [showBulkMoveDialog, setShowBulkMoveDialog] = useState(false);
  const [bulkMoveTargetSheetId, setBulkMoveTargetSheetId] = useState('');
  const [bulkMoveTargetCategory, setBulkMoveTargetCategory] = useState('');
  const [movingBulkMaterials, setMovingBulkMaterials] = useState(false);

  // Zoho order state
  const [showZohoOrderDialog, setShowZohoOrderDialog] = useState(false);
  const [selectedMaterialsForOrder, setSelectedMaterialsForOrder] = useState<MaterialItem[]>([]);

  // Document viewer state
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);

  // Link trim drawing to material item
  const [openLinkTrimForItem, setOpenLinkTrimForItem] = useState<{ id: string; materialName: string; currentTrimConfigId?: string | null } | null>(null);
  const [savedTrimConfigs, setSavedTrimConfigs] = useState<{ id: string; name: string; drawing_segments?: unknown }[]>([]);
  const [loadingTrimConfigs, setLoadingTrimConfigs] = useState(false);
  const [linkingTrimConfigId, setLinkingTrimConfigId] = useState<string | null>(null);
  const [trimFlatstockConfigMap, setTrimFlatstockConfigMap] = useState<Record<string, { name: string; totalInches: number }>>({});
  const [loadingTrimFlatstock, setLoadingTrimFlatstock] = useState(false);
  const [savingFlatstockWidth, setSavingFlatstockWidth] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!openLinkTrimForItem) return;
    setLoadingTrimConfigs(true);
    supabase
      .from('trim_saved_configs')
      .select('id, name, drawing_segments')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          toast.error('Failed to load trim configs');
          setSavedTrimConfigs([]);
        } else {
          setSavedTrimConfigs(data || []);
        }
        setLoadingTrimConfigs(false);
      });
  }, [openLinkTrimForItem]);

  // Load trim configs for Trim / Flatstock tab (total inches per config)
  useEffect(() => {
    if (activeTab !== 'trim-flatstock' || !workbook?.sheets) {
      setTrimFlatstockConfigMap({});
      return;
    }
    const configIds = new Set<string>();
    workbook.sheets.forEach((s: MaterialSheet) => {
      s.items.forEach((i: MaterialItem) => {
        if (i.trim_saved_config_id) configIds.add(i.trim_saved_config_id);
      });
    });
    if (configIds.size === 0) {
      setTrimFlatstockConfigMap({});
      return;
    }
    setLoadingTrimFlatstock(true);
    supabase
      .from('trim_saved_configs')
      .select('id, name, inches, drawing_segments')
      .in('id', Array.from(configIds))
      .then(({ data, error }) => {
        if (error) {
          setTrimFlatstockConfigMap({});
        } else {
          const map: Record<string, { name: string; totalInches: number }> = {};
          (data || []).forEach((row: any) => {
            map[row.id] = { name: row.name ?? 'Trim', totalInches: getTotalInchesFromTrimConfig(row) };
          });
          setTrimFlatstockConfigMap(map);
        }
        setLoadingTrimFlatstock(false);
      });
  }, [activeTab, workbook?.sheets]);

  async function setFlatstockWidthInches(width: number | null) {
    if (!workbook?.id) return;
    setSavingFlatstockWidth(true);
    const { error } = await supabase
      .from('material_workbooks')
      .update({ flatstock_width_inches: width })
      .eq('id', workbook.id);
    setSavingFlatstockWidth(false);
    if (error) {
      toast.error(error.message || 'Failed to save flatstock width');
      return;
    }
    setWorkbook((prev) => (prev ? { ...prev, flatstock_width_inches: width } : null));
    workbookCache.delete(`${job.id}:${effectiveQuoteId ?? null}`);
    toast.success('Flatstock width saved');
  }

  async function setMaterialItemTrimConfig(itemId: string, trimConfigId: string | null) {
    const { error: rpcError } = await supabase.rpc('set_material_item_trim_config', {
      p_material_item_id: itemId,
      p_trim_saved_config_id: trimConfigId,
    });
    if (!rpcError) return;
    const msg = (rpcError?.message || '').toLowerCase();
    if (msg.includes('schema cache') || msg.includes('could not find the function')) {
      const { error: updateError } = await supabase
        .from('material_items')
        .update({ trim_saved_config_id: trimConfigId })
        .eq('id', itemId);
      if (updateError) throw updateError;
      return;
    }
    throw rpcError;
  }

  async function linkTrimConfigToItem(configId: string) {
    if (!openLinkTrimForItem) return;
    setLinkingTrimConfigId(configId);
    try {
      await setMaterialItemTrimConfig(openLinkTrimForItem.id, configId);
      toast.success(`Trim drawing linked to "${openLinkTrimForItem.materialName}". Shop will see it in the pull form.`);
      setOpenLinkTrimForItem(null);
      await loadWorkbook(true);
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('set_material_item_trim_config') && msg.toLowerCase().includes('schema cache')) {
        toast.error('Trim link failed: run the SQL in supabase/migrations/20250319000001_set_material_item_trim_config_rpc.sql in your Supabase SQL Editor, then try again.');
      } else {
        toast.error(msg || 'Failed to link trim');
      }
    } finally {
      setLinkingTrimConfigId(null);
    }
  }

  async function unlinkTrimFromItem() {
    if (!openLinkTrimForItem) return;
    setLinkingTrimConfigId('unlink');
    try {
      await setMaterialItemTrimConfig(openLinkTrimForItem.id, null);
      toast.success('Trim drawing unlinked.');
      setOpenLinkTrimForItem(null);
      await loadWorkbook(true);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to unlink');
    } finally {
      setLinkingTrimConfigId(null);
    }
  }

  // Sheet management state
  const [showAddSheetDialog, setShowAddSheetDialog] = useState(false);
  const [newSheetName, setNewSheetName] = useState('');
  const [newSheetType, setNewSheetType] = useState<'proposal' | 'change_order'>('proposal');
  const [addingSheet, setAddingSheet] = useState(false);

  // Sort categories dialog state
  const [showSortCategoriesDialog, setShowSortCategoriesDialog] = useState(false);
  const [sortCategoriesOrder, setSortCategoriesOrder] = useState<string[]>([]);
  const [savingSortOrder, setSavingSortOrder] = useState(false);
  const [draggedCatIndex, setDraggedCatIndex] = useState<number | null>(null);
  const [dragOverCatIndex, setDragOverCatIndex] = useState<number | null>(null);

  // Zoho sync state
  const [syncingZoho, setSyncingZoho] = useState(false);
  const [showSyncResults, setShowSyncResults] = useState(false);

  // Export XLSX state
  const [exportingXLSX, setExportingXLSX] = useState(false);
  const [syncResults, setSyncResults] = useState<any>(null);
  const [syncChangeDetailsView, setSyncChangeDetailsView] = useState<'inserted' | 'updated' | 'vendors' | null>(null);
  const [refreshingWorkbookPrices, setRefreshingWorkbookPrices] = useState(false);

  // Load job quotes (proposals) so we can scope materials per proposal
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, proposal_number, quote_number, created_at, sent_at, locked_for_editing, is_change_order_proposal')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false });
      if (!mounted) return;
      if (error) {
        console.error('Error loading job quotes:', error);
        setJobQuotes([]);
        if (!isControlled) setSelectedQuoteId(null);
        return;
      }
      const quotes = (data || []) as JobQuote[];
      setJobQuotes(quotes);
      if (!isControlled) {
        setSelectedQuoteId(prev => {
          if (quotes.length === 0) return null;
          if (!prev || !quotes.some(q => q.id === prev)) {
            const defaultQuote = quotes.find(q => !q.is_change_order_proposal) ?? quotes[0];
            return defaultQuote.id;
          }
          return prev;
        });
      }
    })();
    return () => { mounted = false; };
  }, [job.id, isControlled]);

  // When parent selects a proposal that's not in our list yet (e.g. just created), refetch quotes so the new proposal appears
  useEffect(() => {
    if (!isControlled || !effectiveQuoteId || jobQuotes.some((q: any) => q.id === effectiveQuoteId)) return;
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, proposal_number, quote_number, created_at, sent_at, locked_for_editing, is_change_order_proposal')
        .eq('job_id', job.id)
        .order('created_at', { ascending: false });
      if (!mounted) return;
      if (error) return;
      const quotes = (data || []) as JobQuote[];
      setJobQuotes(quotes);
    })();
    return () => { mounted = false; };
  }, [isControlled, effectiveQuoteId, job.id, jobQuotes]);

  // When job or quote changes, reset active sheet so the first sheet in the workbook is shown
  useEffect(() => {
    setActiveSheetId('');
  }, [job.id, effectiveQuoteId ?? null]);

  // Load workbook once we know which quote to use.
  // In uncontrolled mode, wait until jobQuotes has loaded so we use the real quote ID
  // rather than firing a wasted load with null then reloading again immediately after.
  // In controlled mode, the parent provides a real ID (never null thanks to ?? undefined).
  useEffect(() => {
    if (!isControlled && jobQuotes.length === 0) return;
    loadWorkbook();
  }, [job.id, effectiveQuoteId, isControlled, jobQuotes.length]);

  // Load packages once per job; subscribe to package changes (already filtered by job_id)
  useEffect(() => {
    loadPackages();
    const packagesChannel = supabase
      .channel(`material_bundles_changes_${job.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'material_bundles', filter: `job_id=eq.${job.id}` },
        () => { loadPackages(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(packagesChannel); };
  }, [job.id]);

  // Real-time: reload workbook when any material_item or material_sheet changes so newest crew
  // orders appear in the Field Request workbook immediately (invalidate cache so we don't show stale data).
  useEffect(() => {
    const ch = supabase
      .channel(`mgmt_items_${job.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_items' },
        () => {
          for (const key of workbookCache.keys()) {
            if (key.startsWith(`${job.id}:`)) workbookCache.delete(key);
          }
          loadWorkbook(true);
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'material_sheets' },
        () => {
          for (const key of workbookCache.keys()) {
            if (key.startsWith(`${job.id}:`)) workbookCache.delete(key);
          }
          loadWorkbook(true);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [job.id]);

  // When proposal/materials are restored from snapshot (JobFinancials), refetch workbook for this quote
  useEffect(() => {
    const handler = (e: CustomEvent<{ quoteId: string }>) => {
      if (e.detail?.quoteId && e.detail.quoteId === effectiveQuoteId) loadWorkbook(false);
    };
    window.addEventListener('material-workbook-restored', handler as EventListener);
    return () => window.removeEventListener('material-workbook-restored', handler as EventListener);
  }, [effectiveQuoteId]);

  async function loadPackages() {
    try {
      const { data, error } = await supabase
        .from('material_bundles')
        .select(`
          id,
          name,
          description,
          status,
          bundle_items:material_bundle_items(material_item_id)
        `)
        .eq('job_id', job.id)
        .order('name');

      if (error) {
        console.warn('Packages load failed (non-blocking):', error.message);
        setPackages([]);
        return;
      }
      setPackages(data || []);
    } catch (error: any) {
      console.warn('Packages load failed (non-blocking):', error?.message || error);
      setPackages([]);
    }
  }

  /**
   * For items that have a SKU but are missing cost_per_unit, price_per_unit, or length,
   * fetch materials_catalog and merge cost/price/length (part_length from books) into the items in memory.
   * Used so the first paint shows cost/price/length without waiting for DB backfill.
   */
  async function enrichItemsWithCatalogPrices(items: any[]): Promise<any[]> {
    const needsEnrich = items.filter(
      (i: any) => i.sku && (
        i.cost_per_unit == null ||
        i.price_per_unit == null ||
        (i.length == null || i.length === '')
      )
    );
    if (needsEnrich.length === 0) return items;

    const skus = [...new Set(needsEnrich.map((i: any) => i.sku as string))];
    const { data: catalogRows } = await supabase
      .from('materials_catalog')
      .select('sku, purchase_cost, unit_price, part_length')
      .in('sku', skus);

    if (!catalogRows || catalogRows.length === 0) return items;

    const catalogMap = new Map(catalogRows.map((r: any) => [r.sku, r]));

    return items.map((item: any) => {
      if (!item.sku) return item;
      const cat = catalogMap.get(item.sku);
      if (!cat) return item;

      const cost = Number(cat.purchase_cost) || 0;
      const price = Number(cat.unit_price) || 0;
      const rawPartLength = cat.part_length != null && String(cat.part_length).trim() !== '' ? String(cat.part_length).trim() : null;
      const unitOnly = /^(pcs|pc|bag|bags|lf|ft|piece|pieces|ea|each|units?|linear\s*ft)$/i;
      const catalogLength = rawPartLength && !unitOnly.test(rawPartLength) ? rawPartLength : null;
      if (cost === 0 && price === 0 && !catalogLength) return item;

      const safeCost = cost > 0 ? Math.round(cost * 10000) / 10000 : null;
      const safePrice = price > 0 ? Math.round(price * 10000) / 10000 : null;
      const safeMarkup =
        safeCost && safePrice && safeCost > 0
          ? Math.round(((safePrice - safeCost) / safeCost) * 100 * 10000) / 10000
          : null;
      const qty = Number(item.quantity) || 1;
      const rawItemLength = (item.length != null && item.length !== '') ? String(item.length).trim() : null;
      const itemLengthIsUnit = rawItemLength && unitOnly.test(rawItemLength);
      const mergedLength = !itemLengthIsUnit && rawItemLength ? rawItemLength : catalogLength;

      return {
        ...item,
        length: mergedLength ?? null,
        cost_per_unit: item.cost_per_unit == null ? safeCost : item.cost_per_unit,
        price_per_unit: item.price_per_unit == null ? safePrice : item.price_per_unit,
        markup_percent: item.markup_percent == null ? safeMarkup : item.markup_percent,
        extended_cost:
          item.extended_cost == null && safeCost
            ? Math.round(safeCost * qty * 10000) / 10000
            : item.extended_cost,
        extended_price:
          item.extended_price == null && safePrice
            ? Math.round(safePrice * qty * 10000) / 10000
            : item.extended_price,
      };
    });
  }

  /**
   * For any material_items that have a SKU but are missing cost_per_unit or price_per_unit,
   * look up the catalog and patch the DB values in the background.
   * Does NOT block the render; triggers a silent reload if any rows were updated.
   */
  async function backfillMissingPricesFromCatalog(items: any[]) {
    try {
      const needsPrice = items.filter(
        (i: any) => i.sku && (i.cost_per_unit == null || i.price_per_unit == null)
      );
      if (needsPrice.length === 0) return;

      const skus = [...new Set(needsPrice.map((i: any) => i.sku as string))];
      const { data: catalogRows } = await supabase
        .from('materials_catalog')
        .select('sku, purchase_cost, unit_price')
        .in('sku', skus);

      if (!catalogRows || catalogRows.length === 0) return;

      const catalogMap = new Map(catalogRows.map((r: any) => [r.sku, r]));

      let patched = 0;
      for (const item of needsPrice) {
        const cat = catalogMap.get(item.sku);
        if (!cat) continue;

        const cost  = Number(cat.purchase_cost) || 0;
        const price = Number(cat.unit_price)    || 0;
        if (cost === 0 && price === 0) continue;

        const safeCost  = cost  > 0 ? Math.round(cost  * 10000) / 10000 : null;
        const safePrice = price > 0 ? Math.round(price * 10000) / 10000 : null;
        const safeMarkup = safeCost && safePrice && safeCost > 0
          ? Math.round(((safePrice - safeCost) / safeCost) * 100 * 10000) / 10000
          : null;
        const qty = Number(item.quantity) || 1;

        await supabase
          .from('material_items')
          .update({
            cost_per_unit:  item.cost_per_unit  == null ? safeCost  : undefined,
            price_per_unit: item.price_per_unit == null ? safePrice : undefined,
            markup_percent: item.markup_percent == null ? safeMarkup : undefined,
            extended_cost:  (item.extended_cost  == null && safeCost)  ? Math.round(safeCost  * qty * 10000) / 10000 : undefined,
            extended_price: (item.extended_price == null && safePrice) ? Math.round(safePrice * qty * 10000) / 10000 : undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        patched++;
      }

      if (patched > 0) {
        // Invalidate cache so the reload gets fresh data from DB with persisted cost/price
        for (const key of workbookCache.keys()) {
          if (key.startsWith(`${job.id}:`)) workbookCache.delete(key);
        }
        loadWorkbook(true);
      }
    } catch (err) {
      // Non-critical — log but don't surface to the user
      console.warn('backfillMissingPricesFromCatalog error:', err);
    }
  }

  /** Refresh cost/price/length for all material_items in the current workbook from materials_catalog (Zoho Books source). */
  async function refreshWorkbookPricesFromCatalog() {
    if (!workbook?.sheets?.length) return;
    setRefreshingWorkbookPrices(true);
    try {
      const allItems: any[] = workbook.sheets.flatMap((s: any) => (s.items || []).filter((i: any) => i.sku));
      if (allItems.length === 0) {
        toast.info('No materials with SKUs in this workbook to refresh.');
        return;
      }
      const skus = [...new Set(allItems.map((i: any) => i.sku as string))];
      const { data: catalogRows } = await supabase
        .from('materials_catalog')
        .select('sku, purchase_cost, unit_price, part_length')
        .in('sku', skus);
      if (!catalogRows?.length) {
        toast.warning('No catalog data found for these SKUs. Sync from Zoho Books first.');
        return;
      }
      const unitOnly = /^(pcs|pc|bag|bags|lf|ft|piece|pieces|ea|each|units?|linear\s*ft)$/i;
      const catalogMap = new Map(catalogRows.map((r: any) => [
        r.sku,
        {
          cost: Number(r.purchase_cost) || 0,
          price: Number(r.unit_price) || 0,
          length: r.part_length != null && String(r.part_length).trim() !== '' && !unitOnly.test(String(r.part_length).trim())
            ? String(r.part_length).trim()
            : null,
        },
      ]));
      let updated = 0;
      for (const item of allItems) {
        const cat = catalogMap.get(item.sku);
        if (!cat || (cat.cost === 0 && cat.price === 0)) continue;
        const qty = Number(item.quantity) || 1;
        const safeCost = cat.cost > 0 ? Math.round(cat.cost * 10000) / 10000 : null;
        const safePrice = cat.price > 0 ? Math.round(cat.price * 10000) / 10000 : null;
        const safeMarkup = safeCost && safePrice && safeCost > 0
          ? Math.round(((safePrice - safeCost) / safeCost) * 100 * 10000) / 10000
          : null;
        const updatePayload: Record<string, unknown> = {
          cost_per_unit: safeCost,
          price_per_unit: safePrice,
          markup_percent: safeMarkup,
          extended_cost: safeCost != null ? Math.round(safeCost * qty * 10000) / 10000 : null,
          extended_price: safePrice != null ? Math.round(safePrice * qty * 10000) / 10000 : null,
          updated_at: new Date().toISOString(),
        };
        if (cat.length != null) updatePayload.length = cat.length;
        const { error } = await supabase.from('material_items').update(updatePayload).eq('id', item.id);
        if (!error) updated++;
      }
      for (const key of workbookCache.keys()) {
        if (key.startsWith(`${job.id}:`)) workbookCache.delete(key);
      }
      await loadWorkbook(true);
      toast.success(`Refreshed prices from catalog for ${updated} material(s) in this workbook.`);
    } catch (err: any) {
      console.error('refreshWorkbookPricesFromCatalog error:', err);
      toast.error(err?.message || 'Failed to refresh prices from catalog.');
    } finally {
      setRefreshingWorkbookPrices(false);
    }
  }

  async function loadWorkbook(silent = false, overrideQuoteId?: string | null) {
    try {
      const quoteIdForLoad = overrideQuoteId !== undefined ? overrideQuoteId : (effectiveQuoteId ?? null);
      const cacheKey = `${job.id}:${quoteIdForLoad}`;

      // Serve from cache immediately (stale-while-revalidate pattern)
      const cached = workbookCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        setWorkbook(cached.workbook);
        setAllCategories(cached.categories);
        const sheets = cached.workbook?.sheets ?? [];
        const current = activeSheetIdRef.current;
        if (sheets.length > 0 && (!current || !sheets.some((s: any) => s.id === current))) {
          setActiveSheetId(sheets[0].id);
        }
        // Refresh in background without showing the loading spinner
        silent = true;
      } else if (!silent) {
        setLoading(true);
      }

      // Single query: fetch all workbooks for this job, then pick the best one in JS.
      // This collapses 4 sequential fallback round-trips into 1.
      const { data: allWorkbooks, error: wbError } = await supabase
        .from('material_workbooks')
        .select('*')
        .eq('job_id', job.id)
        .order('updated_at', { ascending: false });

      if (wbError) throw wbError;

      const wbs = allWorkbooks || [];
      // Priority: working + matching quote > any status + matching quote > null quote_id (legacy) > any
      const candidates: typeof wbs = [];
      const byQuoteWorking = wbs.find(w => w.status === 'working' && w.quote_id === quoteIdForLoad);
      const byQuoteAny = wbs.find(w => w.quote_id === quoteIdForLoad);
      const byNullQuote = quoteIdForLoad ? wbs.find(w => !w.quote_id) : null;
      if (byQuoteWorking) candidates.push(byQuoteWorking);
      if (byQuoteAny && byQuoteAny !== byQuoteWorking) candidates.push(byQuoteAny);
      if (byNullQuote) candidates.push(byNullQuote);
      wbs.forEach(w => { if (!candidates.includes(w)) candidates.push(w); });

      let workbookData: (typeof wbs)[0] | null = null;
      let sheetsData: any[] = [];
      let itemsData: any[] = [];

      for (const candidate of candidates) {
        const { data: sheets, error: sheetsError } = await supabase
          .from('material_sheets')
          .select('*')
          .eq('workbook_id', candidate.id)
          .order('order_index');
        if (sheetsError) throw sheetsError;
        const sList = sheets || [];
        const sheetIds = sList.map((s: any) => s.id);
        let items: any[] = [];
        if (sheetIds.length > 0) {
          const { data: itemsRes, error: itemsError } = await supabase
            .from('material_items')
            .select('*')
            .in('sheet_id', sheetIds)
            .order('order_index');
          if (itemsError) throw itemsError;
          items = itemsRes || [];
        }
        const hasContent = sList.length > 0 && items.length > 0;
        if (hasContent || !workbookData) {
          workbookData = candidate;
          sheetsData = sList;
          itemsData = items;
          if (hasContent) break;
        }
      }

      if (!workbookData) {
        setWorkbook(null);
        if (!silent) setLoading(false);
        return;
      }

      // Ensure the canonical "Crew Orders" sheet (the one with items) is visible.
      // The primary workbook may contain an empty crew-orders sheet while items are in
      // a sheet belonging to a different working workbook — always prefer the one with items.
      {
        const existingSheetIds = new Set(sheetsData.map((s: any) => s.id));

        // All working workbooks for this job
        const { data: allWorkingWbs } = await supabase
          .from('material_workbooks')
          .select('id')
          .eq('job_id', job.id)
          .eq('status', 'working');
        const workingWbIds = (allWorkingWbs || []).map((w: any) => w.id);

        if (workingWbIds.length > 0) {
          // Fetch ALL crew-orders sheets across all working workbooks (oldest first)
          const { data: allCrewSheets } = await supabase
            .from('material_sheets')
            .select('*')
            .in('workbook_id', workingWbIds)
            .in('sheet_name', ['Field Request', 'Field Requests', 'Crew Orders'])
            .order('created_at', { ascending: true });

          if ((allCrewSheets || []).length > 0) {
            // Load items for every crew-orders sheet so we can find the one with data
            const allCrewItems: Record<string, any[]> = {};
            for (const cs of allCrewSheets!) {
              const { data: csItems } = await supabase
                .from('material_items')
                .select('*')
                .eq('sheet_id', cs.id)
                .order('order_index');
              allCrewItems[cs.id] = csItems || [];
            }

            // Pick the sheet that has the most items (canonical source of truth)
            const canonical = [...allCrewSheets!].sort(
              (a, b) => (allCrewItems[b.id]?.length ?? 0) - (allCrewItems[a.id]?.length ?? 0)
            )[0];

            // Move any crew-requested items that are in a different sheet into the Field Request sheet
            // so they appear in the workbook like the valley trim (e.g. Smart Vent with valley).
            const { data: wrongSheetItems } = await supabase
              .from('material_items')
              .select('id')
              .not('requested_by', 'is', null)
              .neq('sheet_id', canonical.id);
            if ((wrongSheetItems?.length ?? 0) > 0) {
              const ids = wrongSheetItems!.map((r: { id: string }) => r.id);
              await supabase
                .from('material_items')
                .update({ sheet_id: canonical.id, updated_at: new Date().toISOString() })
                .in('id', ids);
              // Re-fetch canonical sheet items so moved items are included
              const { data: canonicalItems } = await supabase
                .from('material_items')
                .select('*')
                .eq('sheet_id', canonical.id)
                .order('order_index');
              allCrewItems[canonical.id] = canonicalItems ?? [];
            }

            if (existingSheetIds.has(canonical.id)) {
              // Ensure itemsData includes the full Field Request sheet (including any we just moved)
              itemsData = itemsData.filter((i: any) => i.sheet_id !== canonical.id).concat(allCrewItems[canonical.id] ?? []);
            } else {
              // The canonical sheet belongs to another workbook.
              // Remove any empty crew-orders placeholder already in sheetsData (don't show two).
              const emptyCrewIdx = sheetsData.findIndex(
                (s: any) =>
                  (s.sheet_name === 'Field Request' || s.sheet_name === 'Field Requests' || s.sheet_name === 'Crew Orders') &&
                  (allCrewItems[s.id]?.length ?? itemsData.filter((i: any) => i.sheet_id === s.id).length) === 0
              );
              if (emptyCrewIdx !== -1) {
                const removedId = sheetsData[emptyCrewIdx].id;
                sheetsData.splice(emptyCrewIdx, 1);
                // drop items that belonged to the removed sheet
                itemsData = itemsData.filter((i: any) => i.sheet_id !== removedId);
              }

              sheetsData.push(canonical);
              itemsData.push(...allCrewItems[canonical.id]);
            }
          }
        }
      }

      // Enrich items that have a SKU but missing cost/price with values from materials_catalog
      // so the sheet shows cost and price on first paint when the catalog has them.
      itemsData = await enrichItemsWithCatalogPrices(itemsData);

      // Sort: proposal sheets first, then change order sheets (each group by order_index)
      sheetsData.sort((a: any, b: any) => {
        const typeA = a.sheet_type === 'change_order' ? 1 : 0;
        const typeB = b.sheet_type === 'change_order' ? 1 : 0;
        if (typeA !== typeB) return typeA - typeB;
        return (a.order_index ?? 0) - (b.order_index ?? 0);
      });

      const sheets: MaterialSheet[] = sheetsData.map((sheet: any) => ({
        ...sheet,
        items: itemsData.filter((item: any) => item.sheet_id === sheet.id),
      }));

      const uniqueCategories = new Set<string>();
      itemsData.forEach((item: any) => { if (item.category) uniqueCategories.add(item.category); });
      const categories = Array.from(uniqueCategories).sort();
      setAllCategories(categories);

      const fullWorkbook = { ...workbookData, sheets };
      setWorkbook(fullWorkbook);

      // Write to cache so the next visit is instant
      workbookCache.set(cacheKey, { workbook: fullWorkbook, categories, cachedAt: Date.now() });

      // Background: backfill cost/price from catalog for any item that has a SKU but no price.
      // Runs silently; if it patches any rows it triggers a silent reload so the user sees prices.
      backfillMissingPricesFromCatalog(itemsData);

      // Only set active sheet to first when current selection is empty or not in the new list.
      // Use ref so realtime/subscription callbacks (stale closure) don't overwrite user's choice.
      const current = activeSheetIdRef.current;
      if (sheets.length > 0 && (!current || !sheets.some((s: any) => s.id === current))) {
        setActiveSheetId(sheets[0].id);
      }
    } catch (error: any) {
      console.error('Error loading workbook:', error);
      const msg = error?.message || 'Unknown error';
      toast.error(msg.includes('schema') || msg.includes('relation') ? `Failed to load materials: ${msg}` : 'Failed to load materials');
    } finally {
      setLoading(false);
    }
  }

  function handleSheetChange(sheetId: string) {
    setActiveSheetId(sheetId);
  }

  function togglePackageSelectionMode() {
    setPackageSelectionMode(!packageSelectionMode);
    setSelectedMaterialsForPackageAdd(new Set());
  }

  function toggleBulkMoveMode() {
    setBulkMoveMode(!bulkMoveMode);
    setSelectedMaterialsForMove(new Set());
  }

  function toggleMaterialForMove(materialId: string) {
    const newSet = new Set(selectedMaterialsForMove);
    if (newSet.has(materialId)) {
      newSet.delete(materialId);
    } else {
      newSet.add(materialId);
    }
    setSelectedMaterialsForMove(newSet);
  }

  function openBulkMoveDialog() {
    if (selectedMaterialsForMove.size === 0) {
      toast.error('Please select at least one material');
      return;
    }
    setBulkMoveTargetSheetId(activeSheetId || '');
    setBulkMoveTargetCategory('');
    setShowBulkMoveDialog(true);
  }

  async function bulkMoveMaterials() {
    if (!bulkMoveTargetSheetId) {
      toast.error('Please select a target sheet');
      return;
    }

    if (!bulkMoveTargetCategory.trim()) {
      toast.error('Please enter a category');
      return;
    }

    if (selectedMaterialsForMove.size === 0) {
      toast.error('No materials selected');
      return;
    }

    setMovingBulkMaterials(true);

    try {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      const materialIds = Array.from(selectedMaterialsForMove);

      const { error } = await supabase
        .from('material_items')
        .update({
          sheet_id: bulkMoveTargetSheetId,
          category: bulkMoveTargetCategory.trim(),
          updated_at: new Date().toISOString(),
        })
        .in('id', materialIds);

      if (error) throw error;

      toast.success(`Moved ${materialIds.length} material${materialIds.length !== 1 ? 's' : ''} successfully`);
      setShowBulkMoveDialog(false);
      setBulkMoveMode(false);
      setSelectedMaterialsForMove(new Set());
      
      // Reload to reflect changes
      await loadWorkbook();

      // Restore scroll position after reload
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error moving materials:', error);
      toast.error(`Failed to move materials: ${error.message || 'Unknown error'}`);
    } finally {
      setMovingBulkMaterials(false);
    }
  }

  function toggleMaterialForPackageAdd(materialId: string) {
    const newSet = new Set(selectedMaterialsForPackageAdd);
    if (newSet.has(materialId)) {
      newSet.delete(materialId);
    } else {
      newSet.add(materialId);
    }
    setSelectedMaterialsForPackageAdd(newSet);
  }

  function openAddToPackageDialog() {
    if (selectedMaterialsForPackageAdd.size === 0) {
      toast.error('Please select at least one material');
      return;
    }
    setTargetPackageId('');
    setShowAddToPackageDialog(true);
  }

  async function addSelectedMaterialsToSelectedPackage() {
    if (!targetPackageId) {
      toast.error('Please select a package');
      return;
    }

    if (selectedMaterialsForPackageAdd.size === 0) {
      toast.error('No materials selected');
      return;
    }

    setAddingMaterialsToPackage(true);

    try {
      console.log('Adding materials to package:', {
        packageId: targetPackageId,
        materialCount: selectedMaterialsForPackageAdd.size,
      });
      
      // Get existing materials in the target package
      const targetPackage = packages.find(p => p.id === targetPackageId);
      const existingMaterialIds = new Set(
        targetPackage?.bundle_items?.map((item: any) => item.material_item_id) || []
      );

      // Filter out materials already in the package
      const materialsToAdd = Array.from(selectedMaterialsForPackageAdd).filter(
        id => !existingMaterialIds.has(id)
      );

      console.log('Materials to add after filtering:', materialsToAdd.length);

      if (materialsToAdd.length === 0) {
        toast.error('All selected materials are already in this package');
        setAddingMaterialsToPackage(false);
        return;
      }

      // Add materials to package
      const bundleItems = materialsToAdd.map(materialId => ({
        bundle_id: targetPackageId,
        material_item_id: materialId,
      }));

      const { error } = await supabase
        .from('material_bundle_items')
        .insert(bundleItems);

      if (error) {
        console.error('Error inserting bundle items:', error);
        throw error;
      }
      
      console.log('Successfully added materials to package');

      toast.success(`Added ${materialsToAdd.length} material${materialsToAdd.length !== 1 ? 's' : ''} to package`);
      setShowAddToPackageDialog(false);
      setPackageSelectionMode(false);
      setSelectedMaterialsForPackageAdd(new Set());
      await loadPackages();
    } catch (error: any) {
      console.error('Error adding materials to package:', error);
      toast.error(`Failed to add materials to package: ${error.message || 'Unknown error'}`);
    } finally {
      setAddingMaterialsToPackage(false);
    }
  }

  async function addMaterialToPackage(materialId: string, packageId: string) {
    try {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      // Check if already in package
      const targetPackage = packages.find(p => p.id === packageId);
      const existingMaterialIds = new Set(
        targetPackage?.bundle_items?.map((item: any) => item.material_item_id) || []
      );

      if (existingMaterialIds.has(materialId)) {
        toast.error('Material is already in this package');
        return;
      }

      const { error } = await supabase
        .from('material_bundle_items')
        .insert({
          bundle_id: packageId,
          material_item_id: materialId,
        });

      if (error) throw error;

      toast.success('Added to package');
      await loadPackages();

      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error adding material to package:', error);
      toast.error('Failed to add to package');
    }
  }

  async function removeMaterialFromPackage(materialId: string, packageId: string) {
    try {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      const { error } = await supabase
        .from('material_bundle_items')
        .delete()
        .eq('bundle_id', packageId)
        .eq('material_item_id', materialId);

      if (error) throw error;

      toast.success('Removed from package');
      await loadPackages();

      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error removing material from package:', error);
      toast.error('Failed to remove from package');
    }
  }

  function isMaterialInAnyPackage(materialId: string): boolean {
    return packages.some(pkg => 
      pkg.bundle_items?.some((item: any) => item.material_item_id === materialId)
    );
  }

  function getMaterialPackageNames(materialId: string): string[] {
    return packages
      .filter(pkg => 
        pkg.bundle_items?.some((item: any) => item.material_item_id === materialId)
      )
      .map(pkg => pkg.name);
  }

  function groupByCategory(items: MaterialItem[], categoryOrder?: string[] | null): CategoryGroup[] {
    // Map: category name → { items, minOrderIndex }
    const categoryMap = new Map<string, { items: MaterialItem[]; minOrderIndex: number }>();

    items.forEach(item => {
      const category = item.category || 'Uncategorized';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { items: [], minOrderIndex: item.order_index ?? Infinity });
      }
      const entry = categoryMap.get(category)!;
      entry.items.push(item);
      // Track the earliest order_index so we can sort categories in workbook order
      entry.minOrderIndex = Math.min(entry.minOrderIndex, item.order_index ?? Infinity);
    });

    const groups = Array.from(categoryMap.entries())
      .map(([category, { items, minOrderIndex }]) => ({
        category,
        items: items.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
        minOrderIndex,
      }));

    if (categoryOrder && categoryOrder.length > 0) {
      // User-defined order: known categories first (in their saved order), unknowns appended by minOrderIndex
      const orderMap = new Map(categoryOrder.map((name, idx) => [name, idx]));
      return groups.sort((a, b) => {
        const ai = orderMap.has(a.category) ? orderMap.get(a.category)! : Infinity;
        const bi = orderMap.has(b.category) ? orderMap.get(b.category)! : Infinity;
        if (ai !== bi) return ai - bi;
        // Both unknown → fall back to workbook order
        return (a as any).minOrderIndex - (b as any).minOrderIndex;
      });
    }

    // Default: sort categories by the position they first appear in the workbook
    return groups.sort((a, b) => (a as any).minOrderIndex - (b as any).minOrderIndex);
  }

  /** Group by package name (priority) or sheet name for unbundled. Package takes priority; no package = group under sheet name. */
  function groupByPackageOrSheet(items: MaterialItem[], sheetName: string): CategoryGroup[] {
    const groupMap = new Map<string, MaterialItem[]>();
    const fallbackGroup = sheetName || 'Sheet';

    items.forEach(item => {
      const packageNames = getMaterialPackageNames(item.id);
      const key = packageNames.length > 0 ? packageNames[0]! : fallbackGroup;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(item);
    });

    const groups = Array.from(groupMap.entries())
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
      }));

    // Package groups first (alphabetically), then the sheet-name group (unbundled) last
    return groups.sort((a, b) => {
      const aIsSheet = a.category === fallbackGroup;
      const bIsSheet = b.category === fallbackGroup;
      if (aIsSheet && !bIsSheet) return 1;
      if (!aIsSheet && bIsSheet) return -1;
      return a.category.localeCompare(b.category);
    });
  }

  function calculateMarkupPercent(cost: number | null, price: number | null): number {
    if (!cost || !price || cost === 0) return 0;
    return ((price - cost) / cost) * 100;
  }

  function startCellEdit(itemId: string, field: string, currentValue: any) {
    if (isWorkbookReadOnly) return;
    setEditingCell({ itemId, field });
    setCellValue(currentValue?.toString() || '');
  }

  async function saveCellEdit(item: MaterialItem) {
    if (!editingCell) return;

    try {
      const { field } = editingCell;
      let value: any = cellValue;

      if (['quantity', 'cost_per_unit', 'price_per_unit'].includes(field)) {
        value = parseFloat(cellValue) || null;
      } else if (field === 'usage' || field === 'length' || field === 'color') {
        value = (typeof cellValue === 'string' ? cellValue.trim() : cellValue) || null;
      } else if (field === 'markup_percent') {
        const percentValue = parseFloat(cellValue);
        if (isNaN(percentValue)) {
          toast.error('Please enter a valid number');
          cancelCellEdit();
          return;
        }
        const decimalValue = percentValue / 100;
        if (decimalValue > 9.9999) {
          toast.error('Markup cannot exceed 999.99%');
          cancelCellEdit();
          return;
        }
        value = decimalValue;
      }

      const updateData: any = {
        [field]: value,
        updated_at: new Date().toISOString(),
      };

      if (field === 'quantity' || field === 'cost_per_unit') {
        const qty = field === 'quantity' ? value : item.quantity;
        const cost = field === 'cost_per_unit' ? value : item.cost_per_unit;
        updateData.extended_cost = qty && cost ? qty * cost : null;
      }

      if (field === 'markup_percent' && item.cost_per_unit) {
        const newPricePerUnit = item.cost_per_unit * (1 + value);
        updateData.price_per_unit = newPricePerUnit;
        updateData.extended_price = item.quantity && newPricePerUnit ? item.quantity * newPricePerUnit : null;
      }

      if (field === 'quantity' || field === 'price_per_unit') {
        const qty = field === 'quantity' ? value : item.quantity;
        const price = field === 'price_per_unit' ? value : item.price_per_unit;
        updateData.extended_price = qty && price ? qty * price : null;
      }

      scrollPositionRef.current = window.scrollY;
      setEditingCell(null);
      setCellValue('');

      // Optimistic update — apply to local state and cache immediately
      if (workbook) {
        const updatedWorkbook = {
          ...workbook,
          sheets: workbook.sheets.map(sheet => ({
            ...sheet,
            items: sheet.items.map(i => i.id === item.id ? { ...i, ...updateData } : i),
          })),
        };
        setWorkbook(updatedWorkbook);
        // Keep cache in sync so switching away and back shows current data
        const cacheKey = `${job.id}:${effectiveQuoteId ?? null}`;
        const existing = workbookCache.get(cacheKey);
        if (existing) {
          workbookCache.set(cacheKey, { ...existing, workbook: updatedWorkbook, cachedAt: Date.now() });
        }
      }

      const { error } = await supabase
        .from('material_items')
        .update(updateData)
        .eq('id', item.id);

      if (error) {
        toast.error(`Failed to update ${field}: ${error.message}`);
        // Reload on error to revert optimistic update
        workbookCache.delete(`${job.id}:${effectiveQuoteId ?? null}`);
        await loadWorkbook();
      } else {
        // Notify proposal panel to refresh totals in real time
        window.dispatchEvent(new CustomEvent('materials-workbook-updated', { detail: { quoteId: effectiveQuoteId ?? null, jobId: job.id } }));
      }

      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });

    } catch (error: any) {
      console.error('Error in saveCellEdit:', error);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      toast.error(`Failed to save: ${error?.message || 'Unknown error'}`);
      await loadWorkbook();
    }
  }

  function cancelCellEdit() {
    setEditingCell(null);
    setCellValue('');
  }

  async function updateStatus(itemId: string, newStatus: string) {
    try {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      // Optimistic update
      if (workbook) {
        const updatedWorkbook = {
          ...workbook,
          sheets: workbook.sheets.map(sheet => ({
            ...sheet,
            items: sheet.items.map(i => 
              i.id === itemId 
                ? { ...i, status: newStatus, updated_at: new Date().toISOString() }
                : i
            ),
          })),
        };
        setWorkbook(updatedWorkbook);
      }

      const { error } = await supabase
        .from('material_items')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      if (error) throw error;

      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
      await loadWorkbook();
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'ordered':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'received':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'pull_from_shop':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'ready_for_job':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'at_job':
        return 'bg-teal-100 text-teal-800 border-teal-300';
      case 'not_ordered':
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  }

  async function deleteItem(itemId: string) {
    if (isWorkbookReadOnly) { toast.error('This proposal is locked and cannot be edited.'); return; }
    if (!confirm('Delete this material?')) return;

    try {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      // Optimistic update
      if (workbook) {
        const updatedWorkbook = {
          ...workbook,
          sheets: workbook.sheets.map(sheet => ({
            ...sheet,
            items: sheet.items.filter(i => i.id !== itemId),
          })),
        };
        setWorkbook(updatedWorkbook);
      }

      const { error } = await supabase
        .from('material_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      toast.success('Material deleted');
      window.dispatchEvent(new CustomEvent('materials-workbook-updated', { detail: { quoteId: effectiveQuoteId ?? null, jobId: job.id } }));

      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error deleting item:', error);
      toast.error('Failed to delete material');
      await loadWorkbook();
    }
  }

  function openMoveItem(item: MaterialItem) {
    setMovingItem(item);
    setMoveToSheetId(item.sheet_id);
    setMoveToCategory(item.category);
    setShowMoveDialog(true);
  }

  async function moveItem() {
    if (!movingItem) return;

    try {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      const { error } = await supabase
        .from('material_items')
        .update({
          sheet_id: moveToSheetId,
          category: moveToCategory,
          updated_at: new Date().toISOString(),
        })
        .eq('id', movingItem.id);

      if (error) throw error;
      toast.success('Material moved');
      setShowMoveDialog(false);
      setMovingItem(null);
      window.dispatchEvent(new CustomEvent('materials-workbook-updated', { detail: { quoteId: effectiveQuoteId ?? null, jobId: job.id } }));
      
      // Reload to reflect move across sheets
      await loadWorkbook();

      // Restore scroll position after reload
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error moving item:', error);
      toast.error('Failed to move material');
    }
  }

  async function loadCatalogMaterials() {
    try {
      setLoadingCatalog(true);
      
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('*')
        .order('category')
        .order('material_name');

      if (error) throw error;

      setCatalogMaterials(data || []);
      
      // Extract unique categories
      const uniqueCategories = [...new Set(data?.map(m => m.category).filter(Boolean))] as string[];
      setCatalogCategories(uniqueCategories.sort());
    } catch (error: any) {
      console.error('Error loading catalog:', error);
      toast.error('Failed to load materials catalog');
    } finally {
      setLoadingCatalog(false);
    }
  }

  function catalogItemKey(item: any) {
    return `${item.sku ?? ''}|${item.material_name ?? ''}`;
  }

  /** Read cost (purchase) and price (selling) from Zoho/catalog. Cost → cost_per_unit, price → price_per_unit.
   * When only one value exists, use it for both so the workbook gets both columns. */
  function getCatalogCostAndPrice(item: any): { cost: number; price: number } {
    if (!item) return { cost: 0, price: 0 };
    const raw = item.raw_metadata ?? item;
    const num = (v: any) => {
      const n = Number(v);
      return typeof n === 'number' && !isNaN(n) ? n : 0;
    };
    // Cost: purchase_cost / purchase_rate / cost_price / cost (from Zoho Books)
    let cost = num(item.purchase_cost) || num(raw.purchase_cost) || num(raw.purchase_rate) || num(raw.cost_price) || num(raw.cost);
    // Price: unit_price / rate / selling_price / sales_rate / price (from Zoho Books)
    let price = num(item.unit_price) || num(raw.unit_price) || num(raw.rate) || num(raw.selling_price) || num(raw.sales_rate) || num(raw.price);
    // When only one value is present, use it for both
    if (cost > 0 && price === 0) price = cost;
    if (price > 0 && cost === 0) cost = price;
    return { cost, price };
  }

  function toggleCatalogMaterialSelection(catalogItem: any) {
    const key = catalogItemKey(catalogItem);
    setSelectedCatalogMaterials(prev => {
      const exists = prev.some(p => catalogItemKey(p) === key);
      if (exists) return prev.filter(p => catalogItemKey(p) !== key);
      return [...prev, catalogItem];
    });
  }

  function isCatalogMaterialSelected(catalogItem: any) {
    const key = catalogItemKey(catalogItem);
    return selectedCatalogMaterials.some(p => catalogItemKey(p) === key);
  }

  async function addMaterialsFromCatalogSelection() {
    if (isWorkbookReadOnly) { toast.error('This proposal is locked and cannot be edited.'); return; }
    if (selectedCatalogMaterials.length === 0) {
      toast.error('Select at least one material');
      return;
    }
    if (!activeSheetId) {
      toast.error('No sheet selected');
      return;
    }
    if (!addToCategory.trim()) {
      toast.error('Choose an "Add to category" for the materials');
      return;
    }
    setAddingCatalogBatch(true);
    try {
      let orderIndex = 0;
      const { data: maxData } = await supabase
        .from('material_items')
        .select('order_index')
        .eq('sheet_id', activeSheetId)
        .eq('category', addToCategory.trim())
        .order('order_index', { ascending: false })
        .limit(1)
        .maybeSingle();
      orderIndex = (maxData?.order_index ?? -1) + 1;

      const quantity = Math.max(0.01, parseFloat(catalogAddQuantity) || 1);
      const colorValue = catalogAddColor.trim() || null;

      for (const item of selectedCatalogMaterials) {
        const { cost, price } = getCatalogCostAndPrice(item);
        const costNum = typeof cost === 'number' && !isNaN(cost) ? cost : null;
        const priceNum = typeof price === 'number' && !isNaN(price) ? price : null;
        const markupDecimal = (costNum != null && costNum > 0 && priceNum != null)
          ? (priceNum - costNum) / costNum
          : 0;
        const extendedCost = costNum != null ? costNum * quantity : null;
        const extendedPrice = priceNum != null ? priceNum * quantity : null;

        const { error } = await supabase
          .from('material_items')
          .insert({
            sheet_id: activeSheetId,
            category: addToCategory.trim(),
            usage: null,
            sku: item.sku ?? null,
            material_name: item.material_name ?? 'Unnamed',
            quantity,
            length: item.part_length ?? null,
            color: colorValue,
            cost_per_unit: costNum,
            markup_percent: markupDecimal,
            price_per_unit: priceNum,
            extended_cost: extendedCost,
            extended_price: extendedPrice,
            taxable: true,
            notes: null,
            order_index: orderIndex++,
            status: 'not_ordered',
            trim_saved_config_id: item.default_trim_saved_config_id ?? null,
          });
        if (error) throw error;
      }

      toast.success(`Added ${selectedCatalogMaterials.length} material(s) to ${activeSheet?.sheet_name}`);
      setSelectedCatalogMaterials([]);
      setCatalogAddQuantity('1');
      setCatalogAddColor('');
      window.dispatchEvent(new CustomEvent('materials-workbook-updated', { detail: { quoteId: effectiveQuoteId ?? null, jobId: job.id } }));
      await loadWorkbook();
      setShowAddDialog(false);
    } catch (error: any) {
      console.error('Error adding materials from catalog:', error);
      toast.error('Failed to add materials: ' + (error?.message ?? 'Unknown error'));
    } finally {
      setAddingCatalogBatch(false);
    }
  }

  function selectMaterialFromCatalog(catalogItem: any) {
    // Auto-fill form with catalog data - use Zoho Books cost/price (correct columns: cost → cost_per_unit, price → price_per_unit)
    const { cost, price } = getCatalogCostAndPrice(catalogItem);
    
    // Calculate markup percentage from Zoho Books prices (for display/reference only)
    let calculatedMarkup = '';
    if (cost > 0 && price > 0) {
      const markupPercent = ((price - cost) / cost) * 100;
      calculatedMarkup = markupPercent.toFixed(1);
    }

    setNewMaterialName(catalogItem.material_name);
    setNewSku(catalogItem.sku || '');
    setNewLength(catalogItem.part_length || '');
    setNewColor(''); // Color not in catalog, user can enter manually
    setNewCostPerUnit(cost.toString());
    setNewPricePerUnit(price.toString()); // Use Zoho Books price directly
    setNewMarkup(calculatedMarkup); // Display calculated markup (reference only)
    setAddToCategory(catalogItem.category || addToCategory);
    
    setAddMaterialDialogMode('custom'); // Switch to custom form so user can edit and click Add Material
    setShowDatabaseSearch(true);
    setCatalogSearchQuery('');
    toast.success(`Material "${catalogItem.material_name}" loaded — edit if needed and click Add Material`);
  }

  function openZohoOrderDialogForMaterial(item: MaterialItem) {
    setSelectedMaterialsForOrder([item]);
    setShowZohoOrderDialog(true);
  }

  function openZohoOrderDialogForCategory(categoryItems: MaterialItem[]) {
    if (categoryItems.length === 0) {
      toast.error('No materials to order');
      return;
    }
    setSelectedMaterialsForOrder(categoryItems);
    setShowZohoOrderDialog(true);
  }

  function openAddDialog(categoryName?: string) {
    setAddToCategory(categoryName || '');
    setNewMaterialName('');
    setNewUsage('');
    setNewSku('');
    setNewQuantity('1');
    setNewLength('');
    setNewColor('');
    setNewCostPerUnit('');
    setNewPricePerUnit(''); // Reset price from catalog
    setNewMarkup(''); // Reset markup (no default)
    setNewNotes('');
    setAddMaterialDialogMode('search'); // Default: Search Database
    setShowDatabaseSearch(true);
    setCatalogSearchQuery('');
    setCatalogSearchCategory('all');
    setSelectedCatalogMaterials([]);
    setCatalogAddQuantity('1');
    setCatalogAddColor('');
    setShowAddDialog(true);
    loadCatalogMaterials();
  }

  /** Get or create the dedicated change order proposal (quote + workbook) for this job. */
  async function getOrCreateChangeOrderWorkbook(): Promise<{ quoteId: string; workbookId: string; quote: { sent_at: string | null; locked_for_editing: boolean | null } }> {
    const { data: changeOrderQuotes } = await supabase
      .from('quotes')
      .select('id, sent_at, locked_for_editing')
      .eq('job_id', job.id)
      .eq('is_change_order_proposal', true)
      .limit(1);
    let quoteId: string;
    let quote: { sent_at: string | null; locked_for_editing: boolean | null };
    if (changeOrderQuotes?.length) {
      quoteId = changeOrderQuotes[0].id;
      quote = { sent_at: changeOrderQuotes[0].sent_at ?? null, locked_for_editing: changeOrderQuotes[0].locked_for_editing ?? null };
    } else {
      const { data: newQuote, error: quoteErr } = await supabase
        .from('quotes')
        .insert({
          job_id: job.id,
          is_change_order_proposal: true,
          created_by: userId,
        } as Record<string, unknown>)
        .select('id, sent_at, locked_for_editing')
        .single();
      if (quoteErr || !newQuote) throw new Error(newQuote ? quoteErr?.message : 'Failed to create change order proposal');
      quoteId = newQuote.id;
      quote = { sent_at: newQuote.sent_at ?? null, locked_for_editing: newQuote.locked_for_editing ?? null };
    }
    const { data: workbooks } = await supabase
      .from('material_workbooks')
      .select('id')
      .eq('quote_id', quoteId)
      .eq('status', 'working')
      .order('updated_at', { ascending: false })
      .limit(1);
    let workbookId: string;
    if (workbooks?.length) {
      workbookId = workbooks[0].id;
    } else {
      const { data: maxWb } = await supabase
        .from('material_workbooks')
        .select('version_number')
        .eq('job_id', job.id)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVer = (maxWb?.version_number ?? 0) + 1;
      const { data: newWb, error: wbErr } = await supabase
        .from('material_workbooks')
        .insert({ job_id: job.id, quote_id: quoteId, version_number: nextVer, status: 'working', created_by: userId })
        .select('id')
        .single();
      if (wbErr || !newWb) throw new Error(wbErr?.message ?? 'Failed to create change order workbook');
      workbookId = newWb.id;
    }
    return { quoteId, workbookId, quote };
  }

  async function addNewSheet() {
    const isChangeOrder = newSheetType === 'change_order';
    if (!isChangeOrder) {
      if (isWorkbookReadOnly) { toast.error('This proposal is locked and cannot be edited.'); return; }
      if (!workbook || workbook.status === 'locked') {
        toast.error('Cannot add sheets to a locked workbook');
        return;
      }
    }
    if (!newSheetName.trim()) {
      toast.error('Please enter a sheet name');
      return;
    }

    setAddingSheet(true);

    try {
      let targetWorkbookId: string;
      let orderIndex: number;
      let changeOrderQuoteId: string | null = null;

      if (isChangeOrder) {
        const co = await getOrCreateChangeOrderWorkbook();
        if (co.quote.sent_at || co.quote.locked_for_editing) {
          toast.error('The change order proposal is locked and cannot be edited.');
          return;
        }
        targetWorkbookId = co.workbookId;
        changeOrderQuoteId = co.quoteId;
        const { data: existingSheets } = await supabase
          .from('material_sheets')
          .select('id')
          .eq('workbook_id', targetWorkbookId)
          .order('order_index');
        orderIndex = (existingSheets?.length ?? 0);
      } else {
        targetWorkbookId = workbook!.id;
        const proposalSheets = workbook!.sheets.filter((s: any) => s.sheet_type !== 'change_order');
        orderIndex = proposalSheets.length > 0 ? Math.max(...proposalSheets.map((s: any) => (s.order_index ?? 0)), -1) + 1 : 0;
      }

      const payload: Record<string, unknown> = {
        workbook_id: targetWorkbookId,
        sheet_name: newSheetName.trim(),
        order_index: orderIndex,
      };
      payload.sheet_type = isChangeOrder ? 'change_order' : 'proposal';

      let { data: newSheet, error } = await supabase
        .from('material_sheets')
        .insert(payload)
        .select()
        .single();

      if (error && typeof error.message === 'string' && /sheet_type|does not exist|unknown column/i.test(error.message)) {
        const { sheet_type: _st, ...payloadWithoutType } = payload as Record<string, unknown> & { sheet_type?: string };
        const res = await supabase.from('material_sheets').insert(payloadWithoutType).select().single();
        newSheet = res.data;
        error = res.error;
        if (!error && isChangeOrder) {
          toast.info('Sheet added. Run the migration that adds sheet_type to material_sheets (see Supabase SQL) to use change order sheets.');
        }
      }

      if (error) throw error;

      toast.success(`Sheet "${newSheetName}" added successfully`);
      setShowAddSheetDialog(false);
      setNewSheetName('');
      setNewSheetType('proposal');

      if (isChangeOrder && changeOrderQuoteId) {
        workbookCache.delete(`${job.id}:${changeOrderQuoteId}`);
        const { data: quotes } = await supabase
          .from('quotes')
          .select('id, proposal_number, quote_number, created_at, sent_at, locked_for_editing, is_change_order_proposal')
          .eq('job_id', job.id)
          .order('created_at', { ascending: false });
        if (quotes?.length) setJobQuotes(quotes as JobQuote[]);
        onQuoteChange?.(changeOrderQuoteId);
        setSelectedQuoteId(changeOrderQuoteId);
        await loadWorkbook(false, changeOrderQuoteId);
        if (newSheet) setActiveSheetId(newSheet.id);
      } else {
        await loadWorkbook();
        if (newSheet) setActiveSheetId(newSheet.id);
      }
    } catch (error: any) {
      console.error('Error adding sheet:', error);
      const msg = error?.message ? `Failed to add sheet: ${error.message}` : 'Failed to add sheet';
      toast.error(msg);
    } finally {
      setAddingSheet(false);
    }
  }

  async function syncMaterialsFromZoho() {
    setSyncingZoho(true);
    
    try {
      console.log('🔄 Starting Zoho Books material sync...');
      
      const { data, error } = await supabase.functions.invoke('zoho-sync', {
        body: { action: 'sync_materials' },
      });

      if (error) {
        let message = error.message;
        if (error instanceof FunctionsHttpError && error.context) {
          try {
            const body = await error.context.json();
            if (body?.error) message = body.details ? `${body.error}: ${body.details}` : body.error;
          } catch {
            try { message = await error.context.text() || message; } catch { /* keep message */ }
          }
        }
        throw new Error(message);
      }

      console.log('✅ Sync completed:', data);
      
      setSyncResults(data);
      setShowSyncResults(true);
      
      // Reload catalog materials to show updated data
      await loadCatalogMaterials();
      
      toast.success(`✅ Synced ${data.itemsSynced || 0} materials from Zoho Books`);
    } catch (error: any) {
      console.error('❌ Sync error:', error);
      toast.error(`Failed to sync materials: ${error?.message || 'Unknown error'}`);
    } finally {
      setSyncingZoho(false);
    }
  }

  async function deleteSheet(sheet: MaterialSheet) {
    if (isWorkbookReadOnly) { toast.error('This proposal is locked and cannot be edited.'); return; }
    if (!workbook || workbook.status === 'locked') {
      toast.error('Cannot delete sheets from a locked workbook');
      return;
    }

    if (workbook.sheets.length === 1) {
      toast.error('Cannot delete the last sheet. Workbooks must have at least one sheet.');
      return;
    }

    if (!confirm(`Delete sheet "${sheet.sheet_name}"? This will also delete all ${sheet.items.length} materials in this sheet.`)) {
      return;
    }

    try {
      // Save current scroll position
      scrollPositionRef.current = window.scrollY;

      const { error } = await supabase
        .from('material_sheets')
        .delete()
        .eq('id', sheet.id);

      if (error) throw error;

      toast.success(`Sheet "${sheet.sheet_name}" deleted`);
      
      // Reload workbook
      await loadWorkbook();
      
      // Set active sheet to first available sheet if current one was deleted
      if (activeSheetId === sheet.id && workbook.sheets.length > 0) {
        const firstAvailableSheet = workbook.sheets.find(s => s.id !== sheet.id);
        if (firstAvailableSheet) {
          setActiveSheetId(firstAvailableSheet.id);
        }
      }

      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error deleting sheet:', error);
      toast.error('Failed to delete sheet');
    }
  }

  /** Open the Sort Categories dialog for the currently active sheet */
  function openSortCategoriesDialog() {
    if (!activeSheet) return;
    // Build the full list of unique categories for this sheet, in current display order
    const currentGroups = groupByCategory(activeSheet.items, activeSheet.category_order);
    const allCats = currentGroups.map(g => g.category);
    setSortCategoriesOrder(allCats);
    setShowSortCategoriesDialog(true);
  }

  /** Persist the new category order to the database.
   *  Tries the category_order column first (requires migration).
   *  Falls back to re-encoding the order into items' order_index values — works without any migration.
   */
  async function saveSortOrder() {
    if (!activeSheet) return;
    setSavingSortOrder(true);

    const invalidateCache = () => {
      for (const key of workbookCache.keys()) {
        if (key.startsWith(`${job.id}:`)) workbookCache.delete(key);
      }
    };

    try {
      // Attempt 1: save to category_order column (only works if migration has been run)
      const { error: colError } = await supabase
        .from('material_sheets')
        .update({ category_order: sortCategoriesOrder })
        .eq('id', activeSheet.id);

      if (!colError) {
        setWorkbook(prev => prev ? {
          ...prev,
          sheets: prev.sheets.map(s =>
            s.id === activeSheet.id ? { ...s, category_order: sortCategoriesOrder } : s
          ),
        } : prev);
        invalidateCache();
        toast.success('Category order saved');
        setShowSortCategoriesDialog(false);
        return;
      }

      // Attempt 2 (fallback): re-encode the desired order into items' order_index values.
      // Each category gets a block of 10 000 indices; items within a category
      // keep their relative position within that block.
      const updates: { id: string; order_index: number }[] = [];
      sortCategoriesOrder.forEach((catName, catIdx) => {
        const base = catIdx * 10000;
        const catItems = activeSheet.items
          .filter(i => (i.category || 'Uncategorized') === catName)
          .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        catItems.forEach((item, itemIdx) => {
          updates.push({ id: item.id, order_index: base + itemIdx });
        });
      });

      // Run updates in parallel
      const results = await Promise.all(
        updates.map(upd =>
          supabase.from('material_items').update({ order_index: upd.order_index }).eq('id', upd.id)
        )
      );
      const firstErr = results.find(r => r.error);
      if (firstErr?.error) throw firstErr.error;

      // Patch local state so the UI reorders immediately
      const orderMap = new Map(updates.map(u => [u.id, u.order_index]));
      setWorkbook(prev => prev ? {
        ...prev,
        sheets: prev.sheets.map(s =>
          s.id === activeSheet.id
            ? { ...s, items: s.items.map(i => ({ ...i, order_index: orderMap.get(i.id) ?? i.order_index })) }
            : s
        ),
      } : prev);
      invalidateCache();
      toast.success('Category order saved');
      setShowSortCategoriesDialog(false);
    } catch (err: any) {
      console.error('Failed to save category order:', err);
      toast.error('Failed to save category order');
    } finally {
      setSavingSortOrder(false);
    }
  }

  /** Move a category up or down in the sort dialog list */
  function moveSortCategory(index: number, direction: 'up' | 'down') {
    const next = [...sortCategoriesOrder];
    const swap = direction === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setSortCategoriesOrder(next);
  }

  async function exportMaterialWorkbookToXLSX() {
    if (!workbook || workbook.sheets.length === 0) {
      toast.error('No workbook or sheets to export');
      return;
    }
    setExportingXLSX(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const headers = [
        'Category',
        'Usage',
        'SKU',
        'Material',
        'Qty',
        'Length',
        'Color',
        'Cost Per Unit',
        'Mark Up',
        'Price Per Unit',
        'Extended Cost',
        'Extended Price',
        'Taxable',
        'Notes',
        'Status',
      ];
      for (const sheet of workbook.sheets) {
        const rows: (string | number | null | boolean)[][] = [headers];
        for (const item of sheet.items) {
          const markupDisplay = item.markup_percent != null ? (item.markup_percent * 100).toFixed(2) : '';
          rows.push([
            item.category ?? '',
            item.usage ?? '',
            item.sku ?? '',
            item.material_name ?? '',
            item.quantity ?? 0,
            item.length ?? '',
            item.color ?? '',
            item.cost_per_unit ?? '',
            markupDisplay,
            item.price_per_unit ?? '',
            item.extended_cost ?? '',
            item.extended_price ?? '',
            item.taxable ?? false,
            item.notes ?? '',
            item.status ?? '',
          ]);
        }
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const sheetName = (sheet.sheet_name || 'Sheet').replace(/[:\\/?*\[\]]/g, ' ').slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
      const safeName = (job.name || 'MaterialWorkbook').replace(/[^a-z0-9_-]/gi, '_');
      const filename = `${safeName}_Material_Workbook_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast.success('Workbook exported to XLSX');
    } catch (error: any) {
      console.error('Export XLSX error:', error);
      toast.error('Failed to export workbook: ' + (error?.message || 'Unknown error'));
    } finally {
      setExportingXLSX(false);
    }
  }

  async function addMaterial() {
    if (!newMaterialName.trim()) {
      toast.error('Please enter a material name');
      return;
    }

    if (!addToCategory.trim()) {
      toast.error('Please enter a category');
      return;
    }

    if (!activeSheetId) {
      toast.error('No active sheet selected');
      return;
    }

    setSaving(true);

    try {
      const quantity = parseFloat(newQuantity) || 1;
      const costPerUnit = parseFloat(newCostPerUnit) || null;
      
      // Use price from Zoho Books if available, otherwise calculate from markup
      let pricePerUnit: number | null = null;
      let markupDecimal = 0;
      
      if (newPricePerUnit) {
        // Price from Zoho Books - use as-is
        pricePerUnit = parseFloat(newPricePerUnit) || null;
        // Calculate markup for storage (reference only)
        if (costPerUnit && pricePerUnit && costPerUnit > 0) {
          markupDecimal = (pricePerUnit - costPerUnit) / costPerUnit;
        }
      } else {
        // Manual entry - calculate from markup
        const markup = parseFloat(newMarkup) || 0;
        markupDecimal = markup / 100;
        pricePerUnit = costPerUnit ? costPerUnit * (1 + markupDecimal) : null;
      }
      
      const extendedCost = costPerUnit ? costPerUnit * quantity : null;
      const extendedPrice = pricePerUnit ? pricePerUnit * quantity : null;

      // Get max order_index for current sheet and category
      const { data: maxData } = await supabase
        .from('material_items')
        .select('order_index')
        .eq('sheet_id', activeSheetId)
        .eq('category', addToCategory.trim())
        .order('order_index', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextOrderIndex = (maxData?.order_index || -1) + 1;

      // If SKU is set, check catalog for default trim drawing to attach
      let defaultTrimConfigId: string | null = null;
      const skuTrim = newSku.trim();
      if (skuTrim) {
        const { data: catalogRow } = await supabase
          .from('materials_catalog')
          .select('default_trim_saved_config_id')
          .eq('sku', skuTrim)
          .maybeSingle();
        defaultTrimConfigId = catalogRow?.default_trim_saved_config_id ?? null;
      }

      // Insert new material
      const { error } = await supabase
        .from('material_items')
        .insert({
          sheet_id: activeSheetId,
          category: addToCategory.trim(),
          usage: newUsage.trim() || null,
          sku: skuTrim || null,
          material_name: newMaterialName.trim(),
          quantity,
          length: newLength.trim() || null,
          color: newColor.trim() || null,
          cost_per_unit: costPerUnit,
          markup_percent: markupDecimal,
          price_per_unit: pricePerUnit,
          extended_cost: extendedCost,
          extended_price: extendedPrice,
          taxable: true,
          notes: newNotes.trim() || null,
          order_index: nextOrderIndex,
          status: 'not_ordered',
          trim_saved_config_id: defaultTrimConfigId,
        });

      if (error) throw error;

      toast.success('Material added');
      setShowAddDialog(false);
      window.dispatchEvent(new CustomEvent('materials-workbook-updated', { detail: { quoteId: effectiveQuoteId ?? null, jobId: job.id } }));
      
      // Reload workbook to show new material
      await loadWorkbook();

      // Restore scroll position
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPositionRef.current, behavior: 'instant' });
      });
    } catch (error: any) {
      console.error('Error adding material:', error);
      toast.error('Failed to add material');
    } finally {
      setSaving(false);
    }
  }

  const activeSheet = workbook?.sheets.find(s => s.id === activeSheetId);
  const filteredItems = activeSheet?.items.filter(item =>
    searchTerm === '' ||
    item.material_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.usage && item.usage.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  // Group by workbook category, using user-defined order when present
  const categoryGroups = groupByCategory(filteredItems, activeSheet?.category_order);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading materials...</p>
      </div>
    );
  }

  const selectedQuote = jobQuotes.find(q => q.id === effectiveQuoteId);
  const proposalLabel = selectedQuote
    ? (selectedQuote.is_change_order_proposal ? 'Change orders' : (selectedQuote.proposal_number || selectedQuote.quote_number || `Proposal ${selectedQuote.id.slice(0, 8)}`))
    : (proposalNumber || 'Proposal');

  // Mirror the same locked logic used in JobFinancials. Put change order proposal last; then sort regular quotes by proposal_number descending.
  const sortedQuotes = [...jobQuotes].sort((a, b) => {
    if (a.is_change_order_proposal && !b.is_change_order_proposal) return 1;
    if (!a.is_change_order_proposal && b.is_change_order_proposal) return -1;
    const na = (a.proposal_number || a.quote_number || '').toString();
    const nb = (b.proposal_number || b.quote_number || '').toString();
    if (na === nb) return 0;
    return nb.localeCompare(na, undefined, { numeric: true });
  });
  const latestQuoteId = sortedQuotes.find(q => !q.is_change_order_proposal)?.id ?? sortedQuotes[0]?.id;
  const isWorkbookReadOnly = !!selectedQuote && (
    selectedQuote.is_change_order_proposal
      ? (!!selectedQuote.sent_at || !!selectedQuote.locked_for_editing)
      : ((sortedQuotes.length > 0 && selectedQuote.id !== latestQuoteId) || !!selectedQuote.sent_at || !!selectedQuote.locked_for_editing)
  );

  const materialsSlot = useMaterialsToolbarSlot();
  const portalTarget = materialsSlot?.ready && materialsSlot?.ref?.current ? materialsSlot.ref.current : null;

  // Action buttons that appear in the top bar (Move / Package / Documents / Export / Add Material).
  // Only rendered when the Workbook tab is active and a workbook exists.
  const workbookActionButtons = activeTab === 'manage' && workbook ? (
    <div className="flex gap-0.5 flex-shrink-0 flex-wrap">
      {packageSelectionMode ? (
        <>
          <Button onClick={openAddToPackageDialog} size="sm" disabled={selectedMaterialsForPackageAdd.size === 0}
            className="h-6 text-[10px] bg-green-600 hover:bg-green-700 whitespace-nowrap px-1.5">
            <Package className="w-2.5 h-2.5 mr-0.5" />
            Add to Pkg ({selectedMaterialsForPackageAdd.size})
          </Button>
          <Button onClick={togglePackageSelectionMode} size="sm" variant="outline"
            className="h-6 text-[10px] whitespace-nowrap px-1.5">
            <X className="w-2.5 h-2.5 mr-0.5" />Cancel
          </Button>
        </>
      ) : bulkMoveMode ? (
        <>
          <Button onClick={openBulkMoveDialog} size="sm" disabled={selectedMaterialsForMove.size === 0}
            className="h-6 text-[10px] bg-orange-600 hover:bg-orange-700 whitespace-nowrap px-1.5">
            <MoveHorizontal className="w-2.5 h-2.5 mr-0.5" />
            Move ({selectedMaterialsForMove.size})
          </Button>
          <Button onClick={toggleBulkMoveMode} size="sm" variant="outline"
            className="h-6 text-[10px] whitespace-nowrap px-1.5">
            <X className="w-2.5 h-2.5 mr-0.5" />Cancel
          </Button>
        </>
      ) : (
        <>
          {workbook.sheets.length > 1 && (
            <Button onClick={toggleBulkMoveMode} size="sm" variant="outline"
              className="h-6 text-[10px] whitespace-nowrap px-1.5 bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100">
              <MoveHorizontal className="w-2.5 h-2.5 mr-0.5" />Move
            </Button>
          )}
          {packages.length > 0 && (
            <Button onClick={togglePackageSelectionMode} size="sm" variant="outline"
              className="h-6 text-[10px] whitespace-nowrap px-1.5 bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100">
              <Package className="w-2.5 h-2.5 mr-0.5" />Package
            </Button>
          )}
          {activeSheet && activeSheet.items.length > 0 && (
            <Button onClick={openSortCategoriesDialog} size="sm" variant="outline"
              className="h-6 text-[10px] whitespace-nowrap px-1.5 bg-violet-50 border-violet-300 text-violet-700 hover:bg-violet-100"
              title="Change the display order of categories for this sheet">
              <ListOrdered className="w-2.5 h-2.5 mr-0.5" />Sort Categories
            </Button>
          )}
          <Button onClick={refreshWorkbookPricesFromCatalog} size="sm" variant="outline"
            disabled={refreshingWorkbookPrices}
            className="h-6 text-[10px] whitespace-nowrap px-1.5 bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
            title="Update cost and price for all materials in this workbook from the catalog (Zoho Books).">
            {refreshingWorkbookPrices ? (
              <><div className="w-2.5 h-2.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mr-0.5" />Refreshing…</>
            ) : (
              <><RefreshCw className="w-2.5 h-2.5 mr-0.5" />Refresh prices</>
            )}
          </Button>
          {!isWorkbookReadOnly && (
            <Button onClick={() => openAddDialog()} size="sm"
              className="h-6 text-[10px] gradient-primary whitespace-nowrap px-1.5">
              <Plus className="w-2.5 h-2.5 mr-0.5" />Add Material
            </Button>
          )}
        </>
      )}
    </div>
  ) : null;

  // Documents and Export XLSX — shown on the far right of the workbook toolbar with a gap from other buttons.
  const workbookActionButtonsRight = activeTab === 'manage' && workbook ? (
    <div className="flex gap-0.5 flex-shrink-0 flex-wrap">
      <Button onClick={() => setShowDocumentViewer(true)} size="sm" variant="outline"
        className="h-6 text-[10px] whitespace-nowrap px-1.5 bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100">
        <FileText className="w-2.5 h-2.5 mr-0.5" />Documents
      </Button>
      <Button onClick={exportMaterialWorkbookToXLSX} size="sm" variant="outline"
        disabled={exportingXLSX}
        className="h-6 text-[10px] whitespace-nowrap px-1.5 bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100">
        <Download className="w-2.5 h-2.5 mr-0.5" />
        {exportingXLSX ? 'Exporting…' : 'Export XLSX'}
      </Button>
    </div>
  ) : null;

  const materialsToolbarContent = (
    <div className="flex items-center gap-1 flex-wrap text-xs">
      <TabsList className="flex flex-wrap items-center gap-1 h-8 p-0 bg-transparent border-0">
        <TabsTrigger
          value="manage"
          className="flex items-center gap-1 h-8 text-xs px-2 rounded-md border border-yellow-600/40 bg-white/10 hover:bg-white/20 text-yellow-100 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:border-slate-300 data-[state=active]:shadow-sm"
        >
          <FileSpreadsheet className="w-3 h-3" />
          <span>Workbook</span>
        </TabsTrigger>
        <TabsTrigger
          value="breakdown"
          className="flex items-center gap-1 h-8 text-xs px-2 rounded-md border border-yellow-600/40 bg-white/10 hover:bg-white/20 text-yellow-100 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:border-slate-300 data-[state=active]:shadow-sm"
        >
          <DollarSign className="w-3 h-3" />
          <span>Breakdown</span>
        </TabsTrigger>
        <TabsTrigger
          value="packages"
          className="flex items-center gap-1 h-8 text-xs px-2 rounded-md border border-yellow-600/40 bg-white/10 hover:bg-white/20 text-yellow-100 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:border-slate-300 data-[state=active]:shadow-sm"
        >
          <Package className="w-3 h-3" />
          <span>Packages</span>
        </TabsTrigger>
        <TabsTrigger
          value="crew-orders"
          className="flex items-center gap-1 h-8 text-xs px-2 rounded-md border border-yellow-600/40 bg-white/10 hover:bg-white/20 text-yellow-100 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:border-slate-300 data-[state=active]:shadow-sm relative"
        >
          <ShoppingCart className="w-3 h-3" />
          <span>Crew Orders</span>
          {pendingCrewCount > 0 && (
            <Badge className="ml-0.5 bg-orange-500 text-white text-[10px] font-bold px-0.5 py-0 leading-none animate-pulse">
              {pendingCrewCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger
          value="trim-flatstock"
          className="flex items-center gap-1 h-8 text-xs px-2 rounded-md border border-yellow-600/40 bg-white/10 hover:bg-white/20 text-yellow-100 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:border-slate-300 data-[state=active]:shadow-sm"
        >
          <Ruler className="w-3 h-3" />
          <span>Trim / Flatstock</span>
        </TabsTrigger>
        <TabsTrigger
          value="upload"
          className="flex items-center gap-1 h-8 text-xs px-2 rounded-md border border-yellow-600/40 bg-white/10 hover:bg-white/20 text-yellow-100 data-[state=active]:bg-white data-[state=active]:text-slate-800 data-[state=active]:border-slate-300 data-[state=active]:shadow-sm"
        >
          <Upload className="w-3 h-3" />
          <span>Upload</span>
        </TabsTrigger>
      </TabsList>
    </div>
  );

  return (
    <div className="w-full min-w-0 px-2 flex flex-col h-full">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-1 flex flex-col flex-1 min-h-0 min-w-0">
        {portalTarget && createPortal(materialsToolbarContent, portalTarget)}
        {!portalTarget && (
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 p-2 rounded-lg border border-slate-200">
            {jobQuotes.length > 1 ? (
              /* Multi-proposal: proposal selector + action buttons on the SAME row */
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Proposal</Label>
                <Select
                  value={effectiveQuoteId ?? ''}
                  onValueChange={(v) => {
                    const id = v || null;
                    onQuoteChange?.(id);
                    setSelectedQuoteId(id);
                  }}
                >
                  <SelectTrigger className="w-[160px] h-8 bg-white border text-xs">
                    <SelectValue placeholder="Select proposal" />
                  </SelectTrigger>
                  <SelectContent>
                    {jobQuotes.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.is_change_order_proposal ? 'Change orders' : (q.proposal_number || q.quote_number || `Proposal ${q.id.slice(0, 8)}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex-1" />
                {workbookActionButtons}
              </div>
            ) : null}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-0">
                <TabsList className="grid w-full grid-cols-6 h-9 bg-white shadow-sm">
                  <TabsTrigger value="manage" className="flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1 text-xs font-semibold py-1">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Workbook</span>
                  </TabsTrigger>
                  <TabsTrigger value="breakdown" className="flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1 text-xs font-semibold py-1">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Breakdown</span>
                  </TabsTrigger>
                  <TabsTrigger value="packages" className="flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1 text-xs font-semibold py-1">
                    <Package className="w-3.5 h-3.5" />
                    <span>Packages</span>
                  </TabsTrigger>
                  <TabsTrigger value="crew-orders" className="flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1 text-xs font-semibold py-1 relative">
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>Crew Orders</span>
                    {pendingCrewCount > 0 && (
                      <Badge className="ml-1 bg-orange-500 text-white text-[10px] font-bold px-1 py-0 leading-none animate-pulse">
                        {pendingCrewCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="trim-flatstock" className="flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1 text-xs font-semibold py-1">
                    <Ruler className="w-3.5 h-3.5" />
                    <span>Trim / Flatstock</span>
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1 text-xs font-semibold py-1">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload</span>
                  </TabsTrigger>
                </TabsList>
              </div>
              {/* Single/no proposal: buttons sit beside the tab strip */}
              {jobQuotes.length <= 1 && workbookActionButtons}
            </div>
          </div>
        )}

        <TabsContent value="manage" className="space-y-3 flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
          {!workbook ? (
            <Card className="w-full">
              <CardContent className="py-12 text-center">
                <FileSpreadsheet className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No Material Workbook</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload an Excel workbook to get started with material management
                </p>
                <Button onClick={() => setActiveTab('upload')} className="gradient-primary">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Workbook
                </Button>
              </CardContent>
            </Card>
          ) : showDocumentViewer ? (
            <FloatingDocumentViewer
              jobId={job.id}
              open={true}
              onClose={() => setShowDocumentViewer(false)}
              embed
              backLabel="Back to Workbook"
            />
          ) : (
            <>
              <Card className="border-2 w-full flex-1 min-h-0 flex flex-col overflow-hidden">
                <CardContent className="p-0 flex-1 min-h-0 flex flex-col overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-100 to-slate-50 border-b">
                    <div className="flex items-center gap-1 px-1.5 py-0.5 overflow-x-auto">
                      <span className="font-semibold text-slate-700 text-sm flex-shrink-0 whitespace-nowrap">
                        {proposalLabel}
                      </span>
                      {workbook.sheets.map((sheet, idx) => {
                        const isChangeOrder = sheet.sheet_type === 'change_order';
                        const prevIsProposal = idx > 0 && workbook.sheets[idx - 1].sheet_type !== 'change_order';
                        return (
                        <Fragment key={sheet.id}>
                          {isChangeOrder && prevIsProposal && (
                            <span className="flex-shrink-0 px-2 py-1 text-[10px] font-semibold text-amber-700 bg-amber-50 rounded border border-amber-200">
                              Change orders
                            </span>
                          )}
                        <div className="relative group flex-shrink-0">
                          <Button
                            variant={activeSheetId === sheet.id ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => handleSheetChange(sheet.id)}
                            className={`flex items-center gap-1 min-w-[100px] justify-start font-semibold pr-6 text-xs h-7 ${activeSheetId === sheet.id ? 'bg-white shadow border border-primary' : 'hover:bg-white/50'}`}
                          >
                            <FileSpreadsheet className="w-3 h-3" />
                            {sheet.sheet_name}
                            <Badge variant="secondary" className="ml-auto text-[10px] px-1">
                              {sheet.items.length}
                            </Badge>
                          </Button>
                          {/* Delete Sheet Button - only show when workbook is working status */}
                          {workbook.status === 'working' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSheet(sheet);
                              }}
                              className="absolute right-0 top-0 h-full w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-l-none"
                              title="Delete this sheet"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        </Fragment>
                      ); })}

                      {/* Add Sheet Button */}
                      {workbook.status === 'working' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setNewSheetType(sheetTypeFilter === 'change_order' ? 'change_order' : 'proposal');
                            setShowAddSheetDialog(true);
                          }}
                          className="flex-shrink-0 border border-dashed border-blue-400 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold min-w-[90px] h-7 text-xs"
                        >
                          <Plus className="w-3 h-3 mr-0.5" />
                          Add {sheetTypeFilter === 'change_order' ? 'Change Order' : 'Sheet'}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="p-1.5 bg-white border-b">
                    <div className="flex items-center gap-2 flex-wrap bg-white text-right">
                      <div className="relative w-48 max-w-[200px] flex-shrink-0">
                        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search materials..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-7 pr-7 h-7 text-xs"
                        />
                        {searchTerm && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSearchTerm('')}
                            className="absolute right-0.5 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      {workbookActionButtons}
                      <div className="flex-1 min-w-4" />
                      {workbookActionButtonsRight}
                    </div>
                  </div>



                  <div className="overflow-x-auto flex-1 min-h-0">
                    {categoryGroups.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        <FileSpreadsheet className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No materials in this sheet</p>
                      </div>
                    ) : (
                      <div className="w-full text-xs">
                        <table className="border-collapse w-full">
                        <thead className="bg-gradient-to-r from-slate-800 to-slate-700 text-white sticky top-0 z-10">
                          <tr>
                            {(packageSelectionMode || bulkMoveMode) && (
                              <th className="text-center p-1 text-[10px] font-bold border-r border-slate-600 whitespace-nowrap w-6">
                                <CheckSquare className="w-3 h-3 mx-auto" />
                              </th>
                            )}
                            <th className="text-center p-1 text-[10px] font-bold border-r border-slate-600 whitespace-nowrap w-16 max-w-[4rem]">Pkg</th>
                            <th className="text-left p-1 text-[10px] font-bold border-r border-slate-600 whitespace-nowrap">SKU</th>
                            <th className="text-left p-1 text-[10px] font-bold border-r border-slate-600 whitespace-nowrap">Material</th>
                            <th className="text-center p-1 text-[10px] font-bold border-r border-slate-600 whitespace-nowrap w-12">Usage</th>
                            <th className="text-center p-1 text-[10px] font-bold border-r border-slate-600 whitespace-nowrap w-12">Length</th>
                            <th className="text-center p-1 text-[10px] font-bold border-r border-slate-600 whitespace-nowrap w-10">Qty</th>
                            <th className="text-center p-1 text-[10px] font-bold border-r border-slate-600 whitespace-nowrap w-14">Color</th>
                            <th className="text-right p-1 text-[10px] font-bold border-r border-slate-600 whitespace-nowrap w-14">Cost/Unit</th>
                            <th className="text-center p-0.5 text-[10px] font-bold border-r border-slate-600 whitespace-nowrap w-12">Markup %</th>
                            <th className="text-right p-1 text-[10px] font-bold border-r border-slate-600 whitespace-nowrap w-16">Price/Unit</th>
                            <th className="text-right p-1 text-[10px] font-bold border-r border-slate-600 whitespace-nowrap w-16">Total</th>
                            <th className="text-center p-1 text-[10px] font-bold border-r border-slate-600 whitespace-nowrap w-14">Status</th>
                            <th className="text-center p-1 text-[10px] font-bold whitespace-nowrap w-14">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoryGroups.map((catGroup, catIndex) => (
                            <>
                              <tr key={`cat-${catIndex}`} className="bg-gradient-to-r from-indigo-100 to-indigo-50 border-y border-indigo-300">
                                <td colSpan={packageSelectionMode ? 14 : 13} className="p-1">
                                  <div className="flex items-center justify-between flex-wrap gap-1">
                                    <div className="flex items-center gap-1">
                                      <FileSpreadsheet className="w-3 h-3 text-indigo-700" />
                                      <h3 className="font-bold text-xs text-indigo-900">{catGroup.category}</h3>
                                      <Badge variant="outline" className="bg-white text-[10px] px-1">
                                        {catGroup.items.length} items
                                      </Badge>
                                    </div>
                                    <div className="flex gap-1">
                                      <Button
                                        size="sm"
                                        onClick={() => openZohoOrderDialogForCategory(catGroup.items)}
                                        className="h-6 text-[10px] bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white px-2"
                                      >
                                        <ShoppingCart className="w-2.5 h-2.5 mr-0.5" />
                                        Order All
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => openAddDialog(catGroup.category)}
                                        className="h-6 text-[10px] bg-indigo-600 hover:bg-indigo-700 px-2"
                                      >
                                        <Plus className="w-2.5 h-2.5 mr-0.5" />
                                        Add to {catGroup.category}
                                      </Button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                              {catGroup.items.map((item, itemIndex) => {
                                const markupPercent = calculateMarkupPercent(item.cost_per_unit, item.price_per_unit);
                                const isEven = itemIndex % 2 === 0;
                                const isEditingThisCell = (field: string) => 
                                  editingCell?.itemId === item.id && editingCell?.field === field;
                                const materialPackageNames = getMaterialPackageNames(item.id);
                                
                                return (
                                  <tr
                                    key={item.id}
                                    className={`border-b transition-colors ${
                                      packageSelectionMode && selectedMaterialsForPackageAdd.has(item.id)
                                        ? 'bg-blue-100 hover:bg-blue-200'
                                        : bulkMoveMode && selectedMaterialsForMove.has(item.id)
                                        ? 'bg-orange-100 hover:bg-orange-200'
                                        : `hover:bg-blue-50 ${isEven ? 'bg-white' : 'bg-slate-50/50'}`
                                    }`}
                                  >
                                    {packageSelectionMode && (
                                      <td className="p-1 border-r whitespace-nowrap">
                                        <div className="flex items-center justify-center">
                                          <Checkbox
                                            checked={selectedMaterialsForPackageAdd.has(item.id)}
                                            onCheckedChange={() => toggleMaterialForPackageAdd(item.id)}
                                            disabled={isMaterialInAnyPackage(item.id)}
                                          />
                                        </div>
                                      </td>
                                    )}
                                    {bulkMoveMode && (
                                      <td className="p-1 border-r whitespace-nowrap">
                                        <div className="flex items-center justify-center">
                                          <Checkbox
                                            checked={selectedMaterialsForMove.has(item.id)}
                                            onCheckedChange={() => toggleMaterialForMove(item.id)}
                                          />
                                        </div>
                                      </td>
                                    )}
                                    <td className="p-1 border-r whitespace-nowrap w-20 max-w-[5rem]">
                                      <div className="min-w-0">
                                        <Select
                                          value=""
                                          onValueChange={(value) => {
                                            if (value.startsWith('remove-')) {
                                              const packageId = value.replace('remove-', '');
                                              removeMaterialFromPackage(item.id, packageId);
                                            } else {
                                              addMaterialToPackage(item.id, value);
                                            }
                                          }}
                                        >
                                          <SelectTrigger className="h-6 text-[10px] border bg-white w-full max-w-[4rem] [&>svg]:hidden justify-start">
                                            <span className="truncate min-w-0 block text-left">
                                              {materialPackageNames.length > 0 ? materialPackageNames.join(', ') : '–'}
                                            </span>
                                          </SelectTrigger>
                                          <SelectContent>
                                            {materialPackageNames.length > 0 && (
                                              <>
                                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                                  Current Packages:
                                                </div>
                                                {packages
                                                  .filter(pkg => 
                                                    pkg.bundle_items?.some((bundleItem: any) => bundleItem.material_item_id === item.id)
                                                  )
                                                  .map(pkg => (
                                                    <SelectItem 
                                                      key={`remove-${pkg.id}`} 
                                                      value={`remove-${pkg.id}`}
                                                      className="text-red-600"
                                                    >
                                                      <div className="flex items-center gap-2">
                                                        <X className="w-3 h-3" />
                                                        Remove from {pkg.name}
                                                      </div>
                                                    </SelectItem>
                                                  ))
                                                }
                                                <div className="h-px bg-border my-1" />
                                              </>
                                            )}
                                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                              Add to Package:
                                            </div>
                                            {packages
                                              .filter(pkg => 
                                                !pkg.bundle_items?.some((bundleItem: any) => bundleItem.material_item_id === item.id)
                                              )
                                              .map(pkg => (
                                                <SelectItem key={pkg.id} value={pkg.id}>
                                                  <div className="flex items-center gap-2">
                                                    <Package className="w-3 h-3" />
                                                    {pkg.name}
                                                  </div>
                                                </SelectItem>
                                              ))
                                            }
                                            {packages.length === 0 && (
                                              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                                                No packages created yet
                                              </div>
                                            )}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </td>
                                    <td className="p-1 border-r whitespace-nowrap">
                                      <div className="font-mono text-xs text-muted-foreground p-1 min-h-[24px]">
                                        {item.sku || '–'}
                                      </div>
                                    </td>
                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('material_name') ? (
                                        <Input
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          className="h-7 text-sm"
                                        />
                                      ) : (
                                        <div 
                                          onClick={() => startCellEdit(item.id, 'material_name', item.material_name)}
                                          className="font-medium text-sm cursor-pointer hover:bg-blue-100 p-1 rounded min-h-[24px] max-w-[360px]"
                                        >
                                          {item.material_name}
                                          {item.notes && (
                                            <div className="text-xs text-muted-foreground mt-0.5">{item.notes}</div>
                                          )}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('usage') ? (
                                        <Input
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          className="h-6 text-xs text-center"
                                          placeholder="pcs, Bag, etc."
                                        />
                                      ) : (
                                        <div
                                          onClick={() => startCellEdit(item.id, 'usage', item.usage ?? '')}
                                          className="text-center text-xs cursor-pointer hover:bg-blue-100 p-1 rounded min-h-[24px]"
                                        >
                                          {item.usage || '–'}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('length') ? (
                                        <Input
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          className="h-6 text-xs text-center"
                                        />
                                      ) : (
                                        <div
                                          onClick={() => startCellEdit(item.id, 'length', item.length)}
                                          className="text-center text-xs cursor-pointer hover:bg-blue-100 p-1 rounded min-h-[24px]"
                                        >
                                          {(() => {
                                            const raw = item.length != null && item.length !== '' ? String(item.length).trim() : '';
                                            const unitLike = /^(pcs|pc|bag|bags|lf|ft|piece|pieces|ea|each|units?|linear\s*ft)$/i;
                                            const isLength = raw && !unitLike.test(raw);
                                            return isLength ? raw : '-';
                                          })()}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('quantity') ? (
                                        <Input
                                          type="number"
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          onFocus={(e) => e.target.select()}
                                          className="h-6 text-xs text-center min-w-[3rem] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                      ) : (
                                        <div
                                          onClick={() => startCellEdit(item.id, 'quantity', item.quantity)}
                                          className="text-center font-semibold text-xs cursor-pointer hover:bg-blue-100 p-1 rounded min-h-[24px]"
                                        >
                                          {item.quantity}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('color') ? (
                                        <Input
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          className="h-6 text-xs text-center"
                                        />
                                      ) : (
                                        <div
                                          onClick={() => startCellEdit(item.id, 'color', item.color)}
                                          className="text-center text-xs cursor-pointer hover:bg-blue-100 p-1 rounded min-h-[24px]"
                                        >
                                          {item.color || '-'}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('cost_per_unit') ? (
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          onFocus={(e) => e.target.select()}
                                          className="h-6 text-xs text-right min-w-[4rem] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                      ) : (
                                        <div
                                          onClick={() => startCellEdit(item.id, 'cost_per_unit', item.cost_per_unit)}
                                          className="text-right font-mono text-xs cursor-pointer hover:bg-blue-100 p-1 rounded min-h-[24px]"
                                        >
                                          {item.cost_per_unit ? `$${item.cost_per_unit.toFixed(2)}` : '-'}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-0.5 border-r whitespace-nowrap">
                                      {isEditingThisCell('markup_percent') ? (
                                        <div className="flex items-center gap-0.5 px-1">
                                          <Input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            max="999"
                                            value={cellValue}
                                            onChange={(e) => setCellValue(e.target.value)}
                                            onBlur={() => saveCellEdit(item)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') { e.preventDefault(); saveCellEdit(item); }
                                              if (e.key === 'Escape') { e.preventDefault(); cancelCellEdit(); }
                                            }}
                                            autoFocus
                                            onFocus={(e) => e.target.select()}
                                            className="h-6 text-xs text-center min-w-[3.5rem] w-16 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            placeholder="0"
                                          />
                                          <span className="text-[10px] text-muted-foreground shrink-0">%</span>
                                        </div>
                                      ) : (
                                        <div
                                          onClick={() => {
                                            const displayMarkup = (item.cost_per_unit != null && item.cost_per_unit > 0 && item.price_per_unit != null)
                                              ? calculateMarkupPercent(item.cost_per_unit, item.price_per_unit)
                                              : (item.markup_percent != null ? item.markup_percent * 100 : 0);
                                            startCellEdit(item.id, 'markup_percent', displayMarkup.toFixed(1));
                                          }}
                                          className="cursor-pointer hover:bg-blue-100 py-0.5 px-1 rounded min-h-[22px] flex items-center justify-center text-xs"
                                          title="Click to edit markup %"
                                        >
                                          {(item.cost_per_unit != null && item.cost_per_unit > 0 && item.price_per_unit != null) || (item.markup_percent != null && item.markup_percent > 0) || markupPercent > 0 ? (
                                            <Badge variant="outline" className="font-semibold text-xs px-2 py-0.5 border-slate-200 bg-slate-50 text-slate-700">
                                              <Percent className="w-3 h-3 mr-1" />
                                              {(() => {
                                                const val = (item.cost_per_unit != null && item.cost_per_unit > 0 && item.price_per_unit != null)
                                                  ? markupPercent
                                                  : (item.markup_percent != null ? item.markup_percent * 100 : markupPercent);
                                                return val % 1 === 0 ? val.toFixed(0) : val.toFixed(1);
                                              })()}
                                            </Badge>
                                          ) : (
                                            <span className="text-[10px] text-muted-foreground">Set</span>
                                          )}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      {isEditingThisCell('price_per_unit') ? (
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={cellValue}
                                          onChange={(e) => setCellValue(e.target.value)}
                                          onBlur={() => saveCellEdit(item)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveCellEdit(item);
                                            if (e.key === 'Escape') cancelCellEdit();
                                          }}
                                          autoFocus
                                          onFocus={(e) => e.target.select()}
                                          className="h-6 text-xs text-right min-w-[4rem] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                      ) : (
                                        <div
                                          onClick={() => startCellEdit(item.id, 'price_per_unit', item.price_per_unit)}
                                          className="text-right font-mono text-xs cursor-pointer hover:bg-blue-100 p-1 rounded min-h-[24px]"
                                        >
                                          {item.price_per_unit ? `$${item.price_per_unit.toFixed(2)}` : '-'}
                                        </div>
                                      )}
                                    </td>

                                    <td className="p-1 text-right border-r">
                                      <div className="font-bold text-xs text-green-700">
                                        {item.extended_price ? `$${item.extended_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                      </div>
                                    </td>

                                    <td className="p-1 border-r whitespace-nowrap">
                                      <Select
                                        value={item.status || 'not_ordered'}
                                        onValueChange={(value) => updateStatus(item.id, value)}
                                      >
                                        <SelectTrigger className={`h-6 text-[10px] font-semibold border ${getStatusColor(item.status || 'not_ordered')}`}>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="not_ordered">Not Ordered</SelectItem>
                                          <SelectItem value="ordered">Ordered</SelectItem>
                                          <SelectItem value="received">Received</SelectItem>
                                          <SelectItem value="pull_from_shop">Pull from Shop</SelectItem>
                                          <SelectItem value="ready_for_job">Ready for Job</SelectItem>
                                          <SelectItem value="at_job">At Job</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </td>

                                    <td className="p-0.5">
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Actions">
                                            <MoreVertical className="w-4 h-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem onClick={() => openZohoOrderDialogForMaterial(item)}>
                                            <ShoppingCart className="w-3.5 h-3.5 mr-2" />
                                            Create Zoho Order
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => setOpenPhotosForItem({ id: item.id, materialName: item.material_name })}>
                                            <ImageIcon className="w-3.5 h-3.5 mr-2" />
                                            Photos
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => setOpenLinkTrimForItem({ id: item.id, materialName: item.material_name, currentTrimConfigId: item.trim_saved_config_id ?? null })}>
                                            <Pencil className="w-3.5 h-3.5 mr-2" />
                                            {item.trim_saved_config_id ? 'View / change trim drawing' : 'Link trim drawing'}
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => openMoveItem(item)}>
                                            <MoveHorizontal className="w-3.5 h-3.5 mr-2" />
                                            Move
                                          </DropdownMenuItem>
                                          {!isWorkbookReadOnly && (
                                            <DropdownMenuItem
                                              onClick={() => deleteItem(item.id)}
                                              className="text-destructive focus:text-destructive"
                                            >
                                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                                              Delete
                                            </DropdownMenuItem>
                                          )}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </td>
                                  </tr>
                                );
                              })}
                            </>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-2">
          {!workbook ? (
            <Card>
              <CardContent className="py-12 text-center">
                <DollarSign className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No Material Workbook</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload an Excel workbook to view cost breakdown
                </p>
                <Button onClick={() => setActiveTab('upload')} className="gradient-primary">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Workbook
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-2">
              <CardHeader className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-6 h-6" />
                    Cost Breakdown
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold">Sheet:</Label>
                    <Select value={activeSheetId} onValueChange={setActiveSheetId}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {workbook.sheets.map(sheet => (
                          <SelectItem key={sheet.id} value={sheet.id}>
                            {sheet.sheet_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {(() => {
                  const sheet = workbook.sheets.find(s => s.id === activeSheetId);
                  if (!sheet || sheet.items.length === 0) {
                    return (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileSpreadsheet className="w-16 h-16 mx-auto mb-3 opacity-50" />
                        <p>No materials in this sheet</p>
                      </div>
                    );
                  }

                  const totalCost = sheet.items.reduce((sum, item) => sum + (item.extended_cost || 0), 0);
                  const totalPrice = sheet.items.reduce((sum, item) => sum + (item.extended_price || 0), 0);
                  const totalProfit = totalPrice - totalCost;
                  const profitMargin = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
                  const categoryGroups = groupByCategory(sheet.items);

                  return (
                    <div className="space-y-6">
                      {/* Overall Totals */}
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 mb-4">Overall Totals - {sheet.sheet_name}</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-white rounded-lg p-6 border-2 border-slate-300 shadow-sm">
                            <div className="text-xs font-semibold text-muted-foreground mb-2">Total Cost</div>
                            <div className="text-3xl font-bold text-red-600">
                              ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-6 border-2 border-green-500 shadow-sm">
                            <div className="text-xs font-semibold text-muted-foreground mb-2">Total Price</div>
                            <div className="text-3xl font-bold text-green-700">
                              ${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-6 border-2 border-blue-500 shadow-sm">
                            <div className="text-xs font-semibold text-muted-foreground mb-2">Total Profit</div>
                            <div className="text-3xl font-bold text-blue-700">
                              ${totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-6 border-2 border-purple-500 shadow-sm">
                            <div className="text-xs font-semibold text-muted-foreground mb-2">Profit Margin</div>
                            <div className="text-3xl font-bold text-purple-700 flex items-center gap-2">
                              <Percent className="w-6 h-6" />
                              {profitMargin.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Category Breakdown */}
                      <div>
                        <h4 className="text-lg font-bold text-slate-900 mb-4">Breakdown by Category</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {categoryGroups.map((catGroup) => {
                            const catCost = catGroup.items.reduce((sum, item) => sum + (item.extended_cost || 0), 0);
                            const catPrice = catGroup.items.reduce((sum, item) => sum + (item.extended_price || 0), 0);
                            const catProfit = catPrice - catCost;
                            const catMargin = catCost > 0 ? (catProfit / catCost) * 100 : 0;

                            return (
                              <div key={catGroup.category} className="border-2 rounded-lg p-4 bg-gradient-to-br from-white to-slate-50 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-2 mb-3">
                                  <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                                  <div className="font-bold text-base text-slate-900">{catGroup.category}</div>
                                  <Badge variant="outline" className="ml-auto">
                                    {catGroup.items.length} items
                                  </Badge>
                                </div>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between items-center py-1">
                                    <span className="text-muted-foreground">Cost:</span>
                                    <span className="font-bold text-red-600">
                                      ${catCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center py-1">
                                    <span className="text-muted-foreground">Price:</span>
                                    <span className="font-bold text-green-600">
                                      ${catPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center py-1">
                                    <span className="text-muted-foreground">Profit:</span>
                                    <span className="font-bold text-blue-600">
                                      ${catProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center py-1 pt-2 border-t-2">
                                    <span className="font-semibold text-slate-700">Margin:</span>
                                    <span className="font-bold text-lg text-purple-600 flex items-center gap-1">
                                      <Percent className="w-4 h-4" />
                                      {catMargin.toFixed(1)}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="packages" className="space-y-2">
          <MaterialPackages jobId={job.id} userId={userId} workbook={workbook} job={job} />
        </TabsContent>

        <TabsContent value="crew-orders" className="space-y-2">
          <OfficeCrewOrders jobId={job.id} onCountChange={setPendingCrewCount} />
        </TabsContent>

        <TabsContent value="trim-flatstock" className="space-y-2 flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
          <Card className="border-2">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Ruler className="w-5 h-5" />
                Trim &amp; flatstock order
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Trim lines that have a drawing (figured) with total inches and pieces of 16&apos; flatstock to order.
              </p>
            </CardHeader>
            <CardContent className="pt-4">
              {!workbook ? (
                <p className="text-muted-foreground text-sm">No workbook. Upload or create one first.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <Label htmlFor="flatstock-width" className="text-sm font-medium">Flatstock width</Label>
                    <Select
                      value={workbook.flatstock_width_inches != null ? String(workbook.flatstock_width_inches) : '42'}
                      onValueChange={(v) => setFlatstockWidthInches(v === '' ? null : parseInt(v, 10))}
                      disabled={savingFlatstockWidth}
                    >
                      <SelectTrigger id="flatstock-width" className="w-[140px]">
                        <SelectValue placeholder="Width" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="41">41&quot; wide</SelectItem>
                        <SelectItem value="42">42&quot; wide</SelectItem>
                      </SelectContent>
                    </Select>
                    {savingFlatstockWidth && (
                      <span className="text-xs text-muted-foreground">Saving…</span>
                    )}
                  </div>
                  {loadingTrimFlatstock ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Loading trim data…
                    </div>
                  ) : (() => {
                const FLATSTOCK_INCHES = 192; // 16'
                const itemsWithTrim: { item: MaterialItem; configName: string; inchesPerPiece: number }[] = [];
                workbook.sheets?.forEach((s: MaterialSheet) => {
                  s.items.forEach((i: MaterialItem) => {
                    if (!i.trim_saved_config_id) return;
                    const config = trimFlatstockConfigMap[i.trim_saved_config_id];
                    if (!config) return;
                    itemsWithTrim.push({
                      item: i,
                      configName: config.name,
                      inchesPerPiece: config.totalInches,
                    });
                  });
                });
                if (itemsWithTrim.length === 0) {
                  return (
                    <p className="text-muted-foreground text-sm">
                      No trim with drawings on this job. Link trim drawings to material lines in the Workbook tab.
                    </p>
                  );
                }
                const q = (n: number) => Number(n) || 0;
                const bySku = new Map<string, { name: string; sku: string | null; totalInches: number; rows: typeof itemsWithTrim }>();
                itemsWithTrim.forEach(({ item, configName, inchesPerPiece }) => {
                  const key = item.sku ?? item.material_name ?? item.id;
                  const totalInches = inchesPerPiece * q(item.quantity);
                  if (!bySku.has(key)) bySku.set(key, { name: item.material_name, sku: item.sku ?? null, totalInches: 0, rows: [] });
                  const agg = bySku.get(key)!;
                  agg.totalInches += totalInches;
                  agg.rows.push({ item, configName, inchesPerPiece });
                });
                const skuRows = Array.from(bySku.entries()).map(([key, agg]) => ({
                  key,
                  ...agg,
                  piecesToOrder: Math.ceil(agg.totalInches / FLATSTOCK_INCHES),
                }));
                return (
                  <div className="space-y-4">
                    <div className="rounded-md border overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="text-left p-2 font-semibold">Material</th>
                            <th className="text-left p-2 font-semibold">SKU</th>
                            <th className="text-left p-2 font-semibold">Trim drawing</th>
                            <th className="text-right p-2 font-semibold">In./piece</th>
                            <th className="text-right p-2 font-semibold">Qty</th>
                            <th className="text-right p-2 font-semibold">Total in.</th>
                            <th className="text-right p-2 font-semibold">Pieces (16&apos;)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {itemsWithTrim.map(({ item, configName, inchesPerPiece }) => {
                            const totalInches = inchesPerPiece * q(item.quantity);
                            const pieces = Math.ceil(totalInches / FLATSTOCK_INCHES);
                            return (
                              <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="p-2">{item.material_name}</td>
                                <td className="p-2 font-mono text-xs">{item.sku ?? '–'}</td>
                                <td className="p-2">{configName}</td>
                                <td className="p-2 text-right">{inchesPerPiece.toFixed(1)}</td>
                                <td className="p-2 text-right">{item.quantity}</td>
                                <td className="p-2 text-right">{totalInches.toFixed(1)}</td>
                                <td className="p-2 text-right font-medium">{pieces}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-3">
                      <h4 className="font-semibold text-sm mb-2">
                        By SKU — pieces of 16&apos; flatstock to order
                        {workbook?.flatstock_width_inches != null && (
                          <span className="text-muted-foreground font-normal"> ({workbook.flatstock_width_inches}&quot; wide)</span>
                        )}
                      </h4>
                      <ul className="space-y-1 text-sm">
                        {skuRows.map(({ key, name, sku, totalInches, piecesToOrder }) => (
                          <li key={key} className="flex justify-between gap-4">
                            <span>{name} {sku && <span className="text-muted-foreground font-mono">({sku})</span>}</span>
                            <span className="font-medium">{piecesToOrder} pieces</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })()}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upload" className="space-y-2">
          <MaterialWorkbookManager jobId={job.id} quoteId={effectiveQuoteId ?? undefined} onWorkbookCreated={loadWorkbook} />
        </TabsContent>
      </Tabs>

      {/* Add Material Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Add Material to {activeSheet?.sheet_name}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncMaterialsFromZoho}
                  disabled={syncingZoho}
                  className="border-purple-500 text-purple-700 hover:bg-purple-50"
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
                {addMaterialDialogMode === 'search' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAddMaterialDialogMode('custom')}
                    className="border-slate-500 text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Custom Material
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAddMaterialDialogMode('search')}
                    className="border-blue-500 text-blue-700 hover:bg-blue-50"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Search Database
                  </Button>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Search Database (default) */}
            {addMaterialDialogMode === 'search' && (
              <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Search className="w-5 h-5 text-blue-700" />
                  <h3 className="font-semibold text-blue-900">Search Materials Database</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <Input
                      placeholder="Search by name, SKU, or category..."
                      value={catalogSearchQuery}
                      onChange={(e) => { setCatalogSearchQuery(e.target.value); setCatalogSearchPage(0); }}
                      className="pl-9"
                    />
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  </div>
                  
                  <Select value={catalogSearchCategory} onValueChange={(v) => { setCatalogSearchCategory(v); setCatalogSearchPage(0); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {catalogCategories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm font-medium text-blue-900">Add to category:</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={allCategories.includes(addToCategory) ? addToCategory : '__other__'}
                      onValueChange={(v) => setAddToCategory(v === '__other__' ? addToCategory : v)}
                    >
                      <SelectTrigger className="w-[200px] bg-white">
                        <SelectValue placeholder="Select or type below..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__other__">Other (type below)</SelectItem>
                        {allCategories.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={addToCategory}
                      onChange={(e) => setAddToCategory(e.target.value)}
                      placeholder="Category name"
                      className="w-[180px] bg-white"
                    />
                    {addToCategory && (
                      <span className="text-xs text-muted-foreground">Adding to &quot;{addToCategory}&quot;</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-blue-900">Quantity (for selected items)</Label>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={catalogAddQuantity}
                      onChange={(e) => setCatalogAddQuantity(e.target.value)}
                      placeholder="1"
                      className="bg-white max-w-[120px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-blue-900">Color (optional)</Label>
                    <Input
                      value={catalogAddColor}
                      onChange={(e) => setCatalogAddColor(e.target.value)}
                      placeholder="e.g., Red, White"
                      className="bg-white max-w-[180px]"
                    />
                  </div>
                </div>

                {/* Search Results */}
                <div className="max-h-64 overflow-y-auto border rounded-lg bg-white">
                  {(() => {
                    const filtered = catalogMaterials.filter(material => {
                      const matchesSearch = catalogSearchQuery === '' || 
                        material.material_name.toLowerCase().includes(catalogSearchQuery.toLowerCase()) ||
                        material.sku.toLowerCase().includes(catalogSearchQuery.toLowerCase()) ||
                        (material.category && material.category.toLowerCase().includes(catalogSearchQuery.toLowerCase()));
                      
                      const matchesCategory = catalogSearchCategory === 'all' || material.category === catalogSearchCategory;
                      
                      return matchesSearch && matchesCategory;
                    });

                    if (loadingCatalog) {
                      return (
                        <div className="text-center py-8">
                          <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                          <p className="text-xs text-muted-foreground">Loading...</p>
                        </div>
                      );
                    }

                    if (filtered.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <p className="text-sm text-muted-foreground">No materials found</p>
                        </div>
                      );
                    }

                    const PAGE_SIZE = 10;
                    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
                    const safePage = Math.min(catalogSearchPage, totalPages - 1);
                    const pageItems = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

                    return (
                      <div className="divide-y">
                        {pageItems.map((material) => {
                          const selected = isCatalogMaterialSelected(material);
                          const { cost, price } = getCatalogCostAndPrice(material);
                          return (
                            <button
                              key={catalogItemKey(material)}
                              type="button"
                              onClick={() => toggleCatalogMaterialSelection(material)}
                              className={`w-full text-left p-3 transition-colors flex items-center gap-3 group ${selected ? 'bg-blue-100 border-l-4 border-blue-600' : 'hover:bg-blue-50'}`}
                            >
                              <Checkbox checked={selected} onCheckedChange={() => toggleCatalogMaterialSelection(material)} onClick={e => e.stopPropagation()} />
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm truncate">{material.material_name}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-muted-foreground font-mono">{material.sku}</span>
                                  {material.category && (
                                    <Badge variant="outline" className="text-xs">
                                      {material.category}
                                    </Badge>
                                  )}
                                  {material.part_length && (
                                    <span className="text-xs text-muted-foreground">{material.part_length}</span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right ml-4 flex flex-col items-end gap-0.5">
                                {price > 0 && (
                                  <>
                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Price</p>
                                    <p className="text-sm font-semibold">${price.toFixed(2)}</p>
                                  </>
                                )}
                                {cost > 0 && price === 0 && (
                                  <>
                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Cost</p>
                                    <p className="text-sm font-semibold">${cost.toFixed(2)}</p>
                                  </>
                                )}
                                <span className="text-xs text-blue-600">{selected ? 'Selected' : 'Click to select'}</span>
                              </div>
                            </button>
                          );
                        })}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-t">
                            <button
                              onClick={() => setCatalogSearchPage(p => Math.max(0, p - 1))}
                              disabled={safePage === 0}
                              className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-slate-200 transition-colors"
                            >
                              ← Prev
                            </button>
                            <p className="text-xs text-muted-foreground">
                              {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} results
                            </p>
                            <button
                              onClick={() => setCatalogSearchPage(p => Math.min(totalPages - 1, p + 1))}
                              disabled={safePage >= totalPages - 1}
                              className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-slate-200 transition-colors"
                            >
                              Next →
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {selectedCatalogMaterials.length > 0 && (
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-blue-300">
                    <span className="text-sm font-medium text-blue-900">
                      {selectedCatalogMaterials.length} material(s) selected
                    </span>
                    <Button
                      onClick={addMaterialsFromCatalogSelection}
                      disabled={addingCatalogBatch || !activeSheetId || !addToCategory.trim()}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {addingCatalogBatch ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                          Adding...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          Add {selectedCatalogMaterials.length} to {activeSheet?.sheet_name ?? 'sheet'}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
            {/* Custom material form (optional) */}
            {addMaterialDialogMode === 'custom' && (
            <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-material-name">Material Name *</Label>
                <Input
                  id="add-material-name"
                  value={newMaterialName}
                  onChange={(e) => setNewMaterialName(e.target.value)}
                  placeholder="e.g., 2x4 Lumber, Roofing Nails..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-category">Category *</Label>
                <Select value={addToCategory} onValueChange={setAddToCategory}>
                  <SelectTrigger id="add-category">
                    <SelectValue placeholder="Select or type new..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allCategories.map(category => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={addToCategory}
                  onChange={(e) => setAddToCategory(e.target.value)}
                  placeholder="Or type new category"
                  className="mt-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-usage">Usage</Label>
                <Input
                  id="add-usage"
                  value={newUsage}
                  onChange={(e) => setNewUsage(e.target.value)}
                  placeholder="e.g., Main building, Porch..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-sku">SKU</Label>
                <Input
                  id="add-sku"
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  placeholder="Part number or SKU"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-quantity">Quantity *</Label>
                <Input
                  id="add-quantity"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-length">Length</Label>
                <Input
                  id="add-length"
                  value={newLength}
                  onChange={(e) => setNewLength(e.target.value)}
                  placeholder="e.g., 8', 10', 12'..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-color">Color</Label>
                <Input
                  id="add-color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  placeholder="e.g., Red, Blue, White..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-cost">Cost/Unit ($)</Label>
                <Input
                  id="add-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newCostPerUnit}
                  onChange={(e) => {
                    setNewCostPerUnit(e.target.value);
                    // If manually editing cost and we have a price, recalculate markup
                    if (newPricePerUnit) {
                      const cost = parseFloat(e.target.value) || 0;
                      const price = parseFloat(newPricePerUnit) || 0;
                      if (cost > 0 && price > 0) {
                        const markup = ((price - cost) / cost) * 100;
                        setNewMarkup(markup.toFixed(1));
                      }
                    }
                  }}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-price">Price/Unit ($) {newPricePerUnit && <span className="text-xs text-muted-foreground">(from Zoho Books)</span>}</Label>
                <Input
                  id="add-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newPricePerUnit}
                  onChange={(e) => {
                    setNewPricePerUnit(e.target.value);
                    // Recalculate markup when price changes
                    if (newCostPerUnit) {
                      const cost = parseFloat(newCostPerUnit) || 0;
                      const price = parseFloat(e.target.value) || 0;
                      if (cost > 0 && price > 0) {
                        const markup = ((price - cost) / cost) * 100;
                        setNewMarkup(markup.toFixed(1));
                      }
                    }
                  }}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-markup">Markup (%) {newPricePerUnit && <span className="text-xs text-muted-foreground">(calculated from Zoho Books prices - reference only)</span>}</Label>
              <Input
                id="add-markup"
                type="number"
                min="0"
                step="0.1"
                value={newMarkup}
                onChange={(e) => {
                  setNewMarkup(e.target.value);
                  // If manually changing markup and no catalog price, calculate new price
                  if (!newPricePerUnit && newCostPerUnit) {
                    const cost = parseFloat(newCostPerUnit) || 0;
                    const markup = parseFloat(e.target.value) || 0;
                    if (cost > 0) {
                      const price = cost * (1 + markup / 100);
                      setNewPricePerUnit(price.toFixed(2));
                    }
                  }
                }}
                placeholder="Enter markup %"
              />
              {newPricePerUnit && (
                <p className="text-xs text-blue-600">
                  💡 Price is from Zoho Books. Markup shown for reference only.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-notes">Notes</Label>
              <Textarea
                id="add-notes"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Optional notes or special instructions..."
                rows={3}
              />
            </div>

            {/* Preview */}
            {newCostPerUnit && newQuantity && (
              <div className="bg-green-50 p-4 rounded-lg border border-green-200 space-y-2">
                <h4 className="font-semibold text-green-900">
                  Price Preview {newPricePerUnit && <span className="text-xs font-normal text-muted-foreground">(Using Zoho Books Prices)</span>}
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Cost/Unit:</span>
                    <span className="ml-2 font-semibold">${parseFloat(newCostPerUnit).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Price/Unit:</span>
                    <span className="ml-2 font-semibold text-green-700">
                      ${newPricePerUnit 
                        ? parseFloat(newPricePerUnit).toFixed(2)
                        : (parseFloat(newCostPerUnit) * (1 + (parseFloat(newMarkup) || 0) / 100)).toFixed(2)
                      }
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Extended Cost:</span>
                    <span className="ml-2 font-semibold">
                      ${(parseFloat(newCostPerUnit) * parseFloat(newQuantity)).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Extended Price:</span>
                    <span className="ml-2 font-bold text-green-700">
                      ${newPricePerUnit
                        ? (parseFloat(newPricePerUnit) * parseFloat(newQuantity)).toFixed(2)
                        : (parseFloat(newCostPerUnit) * parseFloat(newQuantity) * (1 + (parseFloat(newMarkup) || 0) / 100)).toFixed(2)
                      }
                    </span>
                  </div>
                  {newMarkup && (
                    <div className="col-span-2 pt-2 border-t border-green-300">
                      <span className="text-muted-foreground">Markup:</span>
                      <span className="ml-2 font-semibold text-green-700">
                        {parseFloat(newMarkup).toFixed(1)}%
                        {newPricePerUnit && <span className="text-xs text-muted-foreground ml-1">(from Zoho Books)</span>}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={addMaterial}
                disabled={saving}
                className="flex-1"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Material
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowAddDialog(false)}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
            </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Move Material Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move Material</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Move <strong>{movingItem?.material_name}</strong> to a different sheet or category
            </p>

            <div className="space-y-2">
              <Label htmlFor="move-sheet">Sheet</Label>
              <Select value={moveToSheetId} onValueChange={setMoveToSheetId}>
                <SelectTrigger id="move-sheet">
                  <SelectValue placeholder="Select sheet" />
                </SelectTrigger>
                <SelectContent>
                  {workbook?.sheets.map(sheet => (
                    <SelectItem key={sheet.id} value={sheet.id}>
                      {sheet.sheet_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="move-category">Category</Label>
              <Select value={moveToCategory} onValueChange={setMoveToCategory}>
                <SelectTrigger id="move-category">
                  <SelectValue placeholder="Select or enter category" />
                </SelectTrigger>
                <SelectContent>
                  {allCategories.map(category => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={moveToCategory}
                onChange={(e) => setMoveToCategory(e.target.value)}
                placeholder="Or type new category name"
                className="mt-2"
              />
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={moveItem} className="flex-1">
                <MoveHorizontal className="w-4 h-4 mr-2" />
                Move Material
              </Button>
              <Button variant="outline" onClick={() => setShowMoveDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Sheet Dialog */}
      <Dialog open={showAddSheetDialog} onOpenChange={(open) => { setShowAddSheetDialog(open); if (!open) setNewSheetType('proposal'); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add New Sheet
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sheet-type"
                    checked={newSheetType === 'proposal'}
                    onChange={() => setNewSheetType('proposal')}
                    className="rounded-full"
                  />
                  <span className="text-sm font-medium">Proposal sheet</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sheet-type"
                    checked={newSheetType === 'change_order'}
                    onChange={() => setNewSheetType('change_order')}
                    className="rounded-full"
                  />
                  <span className="text-sm font-medium">Change order</span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                {newSheetType === 'change_order' ? 'Change order sheets appear below the proposal and have separate totals. Customers see them in the Change orders section.' : 'Proposal sheets are part of the main proposal total.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sheet-name">Sheet Name *</Label>
              <Input
                id="sheet-name"
                value={newSheetName}
                onChange={(e) => setNewSheetName(e.target.value)}
                placeholder={newSheetType === 'change_order' ? 'e.g., Change order #1, Addition...' : 'e.g., Porch, Garage, Interior...'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !addingSheet && newSheetName.trim()) {
                    addNewSheet();
                  }
                }}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="sheet-type">Sheet Type *</Label>
              <Select value={newSheetType} onValueChange={(v: 'proposal' | 'change_order') => setNewSheetType(v)}>
                <SelectTrigger id="sheet-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proposal">
                    <div className="flex flex-col">
                      <span className="font-medium">Proposal Sheet</span>
                      <span className="text-xs text-muted-foreground">Included in main proposal total</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="change_order">
                    <div className="flex flex-col">
                      <span className="font-medium">Change Order</span>
                      <span className="text-xs text-muted-foreground">Additional work, shown separately</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={addNewSheet}
                disabled={addingSheet || !newSheetName.trim()}
                className="flex-1"
              >
                {addingSheet ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    {newSheetType === 'change_order' ? 'Add Change Order' : 'Add Sheet'}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddSheetDialog(false);
                  setNewSheetName('');
                  setNewSheetType('proposal');
                }}
                disabled={addingSheet}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add to Package Dialog */}
      <Dialog open={showAddToPackageDialog} onOpenChange={setShowAddToPackageDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Materials to Package</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Adding {selectedMaterialsForPackageAdd.size} material{selectedMaterialsForPackageAdd.size !== 1 ? 's' : ''} to a package
            </p>

            <div className="space-y-2">
              <Label htmlFor="target-package">Select Package *</Label>
              <Select value={targetPackageId} onValueChange={setTargetPackageId}>
                <SelectTrigger id="target-package">
                  <SelectValue placeholder="Choose a package..." />
                </SelectTrigger>
                <SelectContent>
                  {packages.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id}>
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        {pkg.name}
                        <Badge variant="secondary" className="ml-2">
                          {pkg.bundle_items?.length || 0} items
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={addSelectedMaterialsToSelectedPackage}
                disabled={addingMaterialsToPackage || !targetPackageId}
                className="flex-1"
              >
                {addingMaterialsToPackage ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Adding...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Add to Package
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowAddToPackageDialog(false)}
                disabled={addingMaterialsToPackage}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Zoho Order Confirmation Dialog */}
      <ZohoOrderConfirmationDialog
        open={showZohoOrderDialog}
        onOpenChange={setShowZohoOrderDialog}
        jobName={job.name}
        materials={selectedMaterialsForOrder}
      />

      {/* Bulk Move Materials Dialog */}
      <Dialog open={showBulkMoveDialog} onOpenChange={setShowBulkMoveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move {selectedMaterialsForMove.size} Material{selectedMaterialsForMove.size !== 1 ? 's' : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Move selected materials to a different sheet and category
            </p>

            <div className="space-y-2">
              <Label htmlFor="bulk-move-sheet">Target Sheet *</Label>
              <Select value={bulkMoveTargetSheetId} onValueChange={setBulkMoveTargetSheetId}>
                <SelectTrigger id="bulk-move-sheet">
                  <SelectValue placeholder="Select sheet" />
                </SelectTrigger>
                <SelectContent>
                  {workbook?.sheets.map(sheet => (
                    <SelectItem key={sheet.id} value={sheet.id}>
                      {sheet.sheet_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-move-category">Target Category *</Label>
              <Select value={bulkMoveTargetCategory} onValueChange={setBulkMoveTargetCategory}>
                <SelectTrigger id="bulk-move-category">
                  <SelectValue placeholder="Select or enter category" />
                </SelectTrigger>
                <SelectContent>
                  {allCategories.map(category => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={bulkMoveTargetCategory}
                onChange={(e) => setBulkMoveTargetCategory(e.target.value)}
                placeholder="Or type new category name"
                className="mt-2"
              />
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded p-3">
              <p className="text-sm font-semibold text-orange-900">
                {selectedMaterialsForMove.size} material{selectedMaterialsForMove.size !== 1 ? 's' : ''} will be moved
              </p>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={bulkMoveMaterials}
                disabled={movingBulkMaterials || !bulkMoveTargetSheetId || !bulkMoveTargetCategory.trim()}
                className="flex-1"
              >
                {movingBulkMaterials ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Moving...
                  </>
                ) : (
                  <>
                    <MoveHorizontal className="w-4 h-4 mr-2" />
                    Move Materials
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowBulkMoveDialog(false)}
                disabled={movingBulkMaterials}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Floating Document Viewer (only when not showing in-place in manage tab) */}
      {showDocumentViewer && !(activeTab === 'manage' && workbook) && (
        <FloatingDocumentViewer
          jobId={job.id}
          open={true}
          onClose={() => setShowDocumentViewer(false)}
        />
      )}

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
                <p className="text-xs text-muted-foreground mb-2">Click a line to see what was changed.</p>
                <div className="space-y-2 text-sm">
                  {syncResults.itemsInserted > 0 && (
                    <button
                      type="button"
                      onClick={() => setSyncChangeDetailsView('inserted')}
                      className="w-full flex items-center gap-2 text-green-700 hover:bg-green-50 rounded p-2 -m-2 text-left transition-colors cursor-pointer"
                    >
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                      <span><strong>{syncResults.itemsInserted}</strong> new material{syncResults.itemsInserted !== 1 ? 's' : ''} added to catalog</span>
                      <span className="text-green-500 ml-1">View details →</span>
                    </button>
                  )}
                  {syncResults.itemsUpdated > 0 && (
                    <button
                      type="button"
                      onClick={() => setSyncChangeDetailsView('updated')}
                      className="w-full flex items-start gap-2 text-orange-700 hover:bg-orange-50 rounded p-2 -m-2 text-left transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div><strong>{syncResults.itemsUpdated}</strong> material{syncResults.itemsUpdated !== 1 ? 's' : ''} updated with latest Zoho Books data</div>
                        <div className="text-xs text-orange-600 mt-1">
                          ℹ️ Updated fields: Name, Category, Prices (unit_price, purchase_cost), Length/Unit, and Metadata
                        </div>
                        <span className="text-orange-500 text-xs mt-1 inline-block">View list →</span>
                      </div>
                    </button>
                  )}
                  {syncResults.vendorsSynced > 0 && (
                    <button
                      type="button"
                      onClick={() => setSyncChangeDetailsView('vendors')}
                      className="w-full flex items-center gap-2 text-blue-700 hover:bg-blue-50 rounded p-2 -m-2 text-left transition-colors cursor-pointer"
                    >
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                      <span><strong>{syncResults.vendorsSynced}</strong> vendor{syncResults.vendorsSynced !== 1 ? 's' : ''} synced</span>
                      <span className="text-blue-500 ml-1">View details →</span>
                    </button>
                  )}
                </div>
              </div>

              {/* What Changed — details dialog */}
              <Dialog open={syncChangeDetailsView !== null} onOpenChange={(open) => !open && setSyncChangeDetailsView(null)}>
                <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                  <DialogHeader>
                    <DialogTitle>
                      {syncChangeDetailsView === 'inserted' && 'New materials added to catalog'}
                      {syncChangeDetailsView === 'updated' && 'Materials updated from Zoho Books'}
                      {syncChangeDetailsView === 'vendors' && 'Vendors synced'}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="flex-1 min-h-0 overflow-y-auto pr-2">
                    {syncChangeDetailsView === 'inserted' && (
                      <>
                        <p className="text-sm text-muted-foreground mb-3">
                          These materials were added to your catalog from Zoho Books. Fields set: Name, Category, Prices, Length/Unit, Metadata.
                        </p>
                        <ul className="space-y-1.5 text-sm">
                          {(syncResults.insertedItems || []).map((row: { sku: string; name: string }, idx: number) => (
                            <li key={idx} className="flex items-center gap-2 py-1 border-b border-slate-100">
                              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                              <span className="font-medium text-slate-900">{row.name}</span>
                              <span className="text-muted-foreground">({row.sku})</span>
                            </li>
                          ))}
                        </ul>
                        {syncResults.itemsInserted > (syncResults.insertedItems?.length || 0) && (
                          <p className="text-xs text-muted-foreground mt-2">
                            … and {syncResults.itemsInserted - (syncResults.insertedItems?.length || 0)} more (list capped at 500).
                          </p>
                        )}
                      </>
                    )}
                    {syncChangeDetailsView === 'updated' && (
                      <>
                        <p className="text-sm text-muted-foreground mb-3">
                          These materials were updated from Zoho Books. Updated fields: Name, Category, unit_price, purchase_cost, Length/Unit, Metadata.
                        </p>
                        <ul className="space-y-1.5 text-sm">
                          {(syncResults.updatedItems || []).map((row: { sku: string; name: string }, idx: number) => (
                            <li key={idx} className="flex items-center gap-2 py-1 border-b border-slate-100">
                              <RefreshCw className="w-4 h-4 text-orange-600 flex-shrink-0" />
                              <span className="font-medium text-slate-900">{row.name}</span>
                              <span className="text-muted-foreground">({row.sku})</span>
                            </li>
                          ))}
                        </ul>
                        {syncResults.itemsUpdated > (syncResults.updatedItems?.length || 0) && (
                          <p className="text-xs text-muted-foreground mt-2">
                            … and {syncResults.itemsUpdated - (syncResults.updatedItems?.length || 0)} more (list capped at 500).
                          </p>
                        )}
                      </>
                    )}
                    {syncChangeDetailsView === 'vendors' && (
                      <p className="text-sm text-slate-700">
                        Vendor names and contact information (contact person, phone, email) were synced from Zoho Books. 
                        A total of <strong>{syncResults.vendorsSynced}</strong> vendor{syncResults.vendorsSynced !== 1 ? 's' : ''} were updated in your database.
                        The sync does not return a per-vendor list; you can review vendors in your Vendors or Zoho settings.
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end pt-3 border-t">
                    <Button onClick={() => setSyncChangeDetailsView(null)}>Close</Button>
                  </div>
                </DialogContent>
              </Dialog>

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

      {/* Sort Categories Dialog */}
      <Dialog open={showSortCategoriesDialog} onOpenChange={(open) => {
        if (!open) { setDraggedCatIndex(null); setDragOverCatIndex(null); }
        setShowSortCategoriesDialog(open);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-violet-600" />
              Sort Categories — {activeSheet?.sheet_name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-3">
            Drag rows to reorder categories for this sheet. Order is saved per sheet and applies to all users.
          </p>
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1 pb-1">
            {sortCategoriesOrder.map((cat, idx) => (
              <div
                key={cat}
                draggable
                onDragStart={(e) => {
                  setDraggedCatIndex(idx);
                  e.dataTransfer.effectAllowed = 'move';
                  // Required for Firefox
                  e.dataTransfer.setData('text/plain', String(idx));
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (draggedCatIndex !== null && draggedCatIndex !== idx) {
                    setDragOverCatIndex(idx);
                  }
                }}
                onDragLeave={() => setDragOverCatIndex(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedCatIndex === null || draggedCatIndex === idx) return;
                  const next = [...sortCategoriesOrder];
                  const [removed] = next.splice(draggedCatIndex, 1);
                  next.splice(idx, 0, removed);
                  setSortCategoriesOrder(next);
                  setDraggedCatIndex(null);
                  setDragOverCatIndex(null);
                }}
                onDragEnd={() => {
                  setDraggedCatIndex(null);
                  setDragOverCatIndex(null);
                }}
                className={[
                  'flex items-center gap-2 rounded-lg px-3 py-2.5 border select-none transition-all duration-100',
                  draggedCatIndex === idx
                    ? 'opacity-40 bg-slate-100 border-slate-300 shadow-none'
                    : dragOverCatIndex === idx
                      ? 'border-violet-500 bg-violet-50 shadow-lg ring-1 ring-violet-400'
                      : 'bg-white border-slate-200 shadow-sm hover:border-slate-300 hover:shadow',
                ].join(' ')}
              >
                <GripVertical className="w-4 h-4 text-slate-400 flex-shrink-0 cursor-grab active:cursor-grabbing" />
                <span className="w-5 text-center text-xs font-bold text-slate-400">
                  {idx + 1}
                </span>
                <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                <span className="flex-1 text-sm font-medium text-slate-800 truncate">{cat}</span>
                <div className="flex gap-0.5 flex-shrink-0">
                  <Button
                    variant="ghost" size="sm" disabled={idx === 0}
                    onClick={() => moveSortCategory(idx, 'up')}
                    className="h-6 w-6 p-0 text-slate-400 hover:text-slate-900 disabled:opacity-20"
                    title="Move up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="sm" disabled={idx === sortCategoriesOrder.length - 1}
                    onClick={() => moveSortCategory(idx, 'down')}
                    className="h-6 w-6 p-0 text-slate-400 hover:text-slate-900 disabled:opacity-20"
                    title="Move down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center mt-4 pt-3 border-t gap-2">
            <Button
              variant="outline" size="sm" className="text-xs"
              onClick={() => {
                if (!activeSheet) return;
                const natural = groupByCategory(activeSheet.items);
                setSortCategoriesOrder(natural.map(g => g.category));
              }}
            >
              Reset to workbook order
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowSortCategoriesDialog(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-xs bg-violet-600 hover:bg-violet-700 text-white"
                disabled={savingSortOrder}
                onClick={saveSortOrder}
              >
                {savingSortOrder ? 'Saving…' : 'Save Order'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {openPhotosForItem && (
        <MaterialItemPhotos
          key={openPhotosForItem.id}
          materialItemId={openPhotosForItem.id}
          materialName={openPhotosForItem.materialName}
          trigger="none"
          open={true}
          onOpenChange={(open) => !open && setOpenPhotosForItem(null)}
        />
      )}

      {/* Link trim drawing to this material item */}
      <Dialog open={!!openLinkTrimForItem} onOpenChange={(open) => !open && setOpenLinkTrimForItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              Trim drawing for &quot;{openLinkTrimForItem?.materialName}&quot;
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {openLinkTrimForItem?.currentTrimConfigId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full border-amber-500 text-amber-700"
                disabled={linkingTrimConfigId === 'unlink'}
                onClick={unlinkTrimFromItem}
              >
                Unlink current drawing
              </Button>
            )}
            <p className="text-sm text-muted-foreground">Link a saved trim so the shop can see the drawing when pulling this item:</p>
            {loadingTrimConfigs ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Loading saved trims…</div>
            ) : savedTrimConfigs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved trim configurations yet. Draw one below, then come back and link it.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-2">
                {savedTrimConfigs.map((config) => (
                  <div key={config.id} className="flex items-center justify-between gap-2 rounded border p-2">
                    <span className="font-medium text-sm truncate">{config.name}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={linkingTrimConfigId === config.id}
                      onClick={() => linkTrimConfigToItem(config.id)}
                    >
                      {linkingTrimConfigId === config.id ? 'Linking…' : 'Link'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-2">Draw a new trim below; when you save, it will be linked to this material so the shop can see the drawing.</p>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="w-full"
                onClick={() => {
                  const materialItemId = openLinkTrimForItem?.id ?? '';
                  setOpenLinkTrimForItem(null);
                  navigate(`/office?tab=trim-calculator&linkToMaterialItem=${materialItemId}`, { replace: true });
                }}
              >
                Open Trim Calculator to draw new trim
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
