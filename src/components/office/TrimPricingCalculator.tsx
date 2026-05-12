import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useSearchParams } from 'react-router-dom';
import { Calculator, Settings, Info, X, Plus, Trash2, Save, FolderOpen, Pencil, Trash, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Download, Undo2, Layers, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { isAbortLikeError } from '@/lib/error-handler';
import { TrimDrawingPreview } from '@/components/office/TrimDrawingPreview';
import { getOutsideBendAngleLabelBisectorRad } from '@/lib/trimAngleLabelPlacement';

// Settings are now stored in database, not localStorage

interface InchInput {
  id: string;
  value: string;
}

interface SavedConfig {
  id: string;
  name: string;
  job_id: string | null;
  job_name: string | null;
  inches: number[];
  bends: number;
  drawing_segments?: LineSegment[];
  created_at: string;
  material_type_id?: string;
  material_type_name?: string;
  /** When true, treat as custom trim; false = standard library. Undefined uses legacy job_id rule. */
  is_custom_trim?: boolean | null;
}

/** Standard = library trim; custom = job-specific or one-off (or legacy rows with job_id). */
function isSavedConfigCustom(config: SavedConfig): boolean {
  if (config.is_custom_trim === true) return true;
  if (config.is_custom_trim === false) return false;
  return !!config.job_id;
}

interface Point {
  x: number;
  y: number;
}

interface LineSegment {
  id: string;
  start: Point;
  end: Point;
  label: string;
  hasHem: boolean;
  hemAtStart: boolean;
  hemSide?: 'left' | 'right'; // Which side the hem is on
  /** Per-segment hem depth in inches. Falls back to global hemDepthInches for legacy rows. */
  hemDepthInches?: number;
}

/** Normalize stored drawing_segments JSON into canvas segments (same rules as load). */
function parseDrawingSegmentsFromSavedConfig(config: SavedConfig): LineSegment[] {
  try {
    if (!config.drawing_segments) return [];
    const raw =
      typeof config.drawing_segments === 'string'
        ? JSON.parse(config.drawing_segments)
        : config.drawing_segments;
    const arr = Array.isArray(raw) ? raw : [];
    if (arr.length === 0) return [];
    return arr.map((seg: any, index: number) => ({
      id: seg.id ?? `seg-${index}-${Date.now()}`,
      start:
        seg.start && typeof seg.start.x === 'number' && typeof seg.start.y === 'number'
          ? { x: seg.start.x, y: seg.start.y }
          : { x: 0, y: 0 },
      end:
        seg.end && typeof seg.end.x === 'number' && typeof seg.end.y === 'number'
          ? { x: seg.end.x, y: seg.end.y }
          : { x: 0, y: 0 },
      label: seg.label ?? String.fromCharCode(65 + index),
      hasHem: seg.hasHem === true,
      hemAtStart: seg.hemAtStart === true,
      hemSide: seg.hemSide === 'left' || seg.hemSide === 'right' ? seg.hemSide : 'right',
      hemDepthInches:
        typeof seg.hemDepthInches === 'number' && Number.isFinite(seg.hemDepthInches)
          ? Math.max(0.125, seg.hemDepthInches)
          : undefined,
    }));
  } catch {
    return [];
  }
}

/** Plain JSON row for backup / external tools (matches DB-oriented export scripts). */
function serializeSavedConfigForExport(c: SavedConfig): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: c.id,
    name: c.name,
    job_id: c.job_id,
    job_name: c.job_name,
    inches: c.inches,
    bends: c.bends,
    drawing_segments: c.drawing_segments ?? null,
    material_type_id: c.material_type_id ?? null,
    material_type_name: c.material_type_name ?? null,
    created_at: c.created_at,
  };
  if (Object.prototype.hasOwnProperty.call(c, 'is_custom_trim')) {
    base.is_custom_trim = c.is_custom_trim;
  }
  return base;
}

function downloadJsonFile(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function sanitizePdfFilenameBase(name: string): string {
  const cleaned = name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'Trim-Drawing';
}

/** Narrow surface used when building multi-page trim PDFs (jsPDF instance). */
interface TrimPdfDoc {
  addPage(): void;
  internal: { pageSize: { getWidth(): number; getHeight(): number } };
  setTextColor(r: number, g: number, b: number): void;
  setFont(face: string, style: string): void;
  setFontSize(size: number): void;
  splitTextToSize(text: string, maxWidth: number): string[];
  text(text: string | string[], x: number, y: number): void;
  addImage(imageData: string, format: string, x: number, y: number, w: number, h: number): void;
  save(filename: string): void;
}

interface DrawingState {
  segments: LineSegment[];
  selectedSegmentId: string | null;
  currentPoint: Point | null;
  nextLabel: number;
}

interface EditMode {
  segmentId: string;
  measurement: string;
  angle: string;
}

interface HemPreviewMode {
  segmentId: string;
  hemAtStart: boolean; // true = hem at segment start, false = at segment end
}

interface TrimType {
  id: string;
  name: string;
  width_inches: number;
  cost_per_lf: number;
  price_per_bend: number;
  markup_percent: number;
  cut_price: number;
  active: boolean;
}

export function TrimPricingCalculator() {
  const [searchParams, setSearchParams] = useSearchParams();
  const linkToMaterialItemId = searchParams.get('linkToMaterialItem');

  // Material type selection
  const [trimTypes, setTrimTypes] = useState<TrimType[]>([]);
  const [selectedTrimTypeId, setSelectedTrimTypeId] = useState<string>('');
  const [selectedTrimType, setSelectedTrimType] = useState<TrimType | null>(null);
  
  // Dynamic inch inputs
  const [inchInputs, setInchInputs] = useState<InchInput[]>([
    { id: '1', value: '' }
  ]);
  const [numberOfBends, setNumberOfBends] = useState<string>('');
  
  // Results (always calculated, shown even if 0)
  const [totalInches, setTotalInches] = useState(0);
  const [totalBendCost, setTotalBendCost] = useState(0);
  const [costPerInch, setCostPerInch] = useState(0);
  const [costPerBend, setCostPerBend] = useState(0);
  const [totalInchCost, setTotalInchCost] = useState(0);
  const [totalCutCost, setTotalCutCost] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [materialCost, setMaterialCost] = useState(0); // Cost before markup
  const [markupAmount, setMarkupAmount] = useState(0); // Markup added
  
  // Dialog states
  const [showInfo, setShowInfo] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showExportTrimsDialog, setShowExportTrimsDialog] = useState(false);
  const [exportTrimScope, setExportTrimScope] = useState<'standard' | 'custom' | 'all'>('standard');
  const [exportIncludeTrimTypes, setExportIncludeTrimTypes] = useState(true);
  
  // Trim type management
  const [showTrimTypeManagement, setShowTrimTypeManagement] = useState(false);
  const [showMaterialInfo, setShowMaterialInfo] = useState(false);
  const [editingTrimType, setEditingTrimType] = useState<TrimType | null>(null);
  const [newTrimTypeName, setNewTrimTypeName] = useState('');
  const [newTrimTypeWidth, setNewTrimTypeWidth] = useState('42');
  const [newTrimTypeCost, setNewTrimTypeCost] = useState('3.46');
  const [newTrimTypeBendPrice, setNewTrimTypeBendPrice] = useState('1.00');
  const [newTrimTypeMarkup, setNewTrimTypeMarkup] = useState('35');
  const [newTrimTypeCutPrice, setNewTrimTypeCutPrice] = useState('1.00');

  // Save/Load
  const [configName, setConfigName] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [addToJobWorkbook, setAddToJobWorkbook] = useState(false);
  const [workbookAddQty, setWorkbookAddQty] = useState<string>('1');
  const [workbookAddColor, setWorkbookAddColor] = useState('');
  const [jobs, setJobs] = useState<any[]>([]);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingConfigId, setDeletingConfigId] = useState<string | null>(null);
  const [reclassifyingConfigId, setReclassifyingConfigId] = useState<string | null>(null);
  /** Save dialog: standard (default) vs custom trim classification */
  const [saveAsCustomTrim, setSaveAsCustomTrim] = useState(false);
  /** Load saved config dialog: default tab is always standard library */
  const [loadSavedTrimTab, setLoadSavedTrimTab] = useState<'standard' | 'custom'>('standard');
  const [loadConfigSearch, setLoadConfigSearch] = useState('');
  /** Trim price list dialog: same default */
  const [priceListTrimTab, setPriceListTrimTab] = useState<'standard' | 'custom'>('standard');

  // Drawing feature states
  const [showDrawing, setShowDrawing] = useState(true); // Always show drawing
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasScrollContainerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);
  const [drawing, setDrawing] = useState<DrawingState>({
    segments: [],
    selectedSegmentId: null,
    currentPoint: null,
    nextLabel: 65 // ASCII 'A'
  });
  const MAX_DRAWING_HISTORY = 50;
  const [drawingHistory, setDrawingHistory] = useState<DrawingState[]>([]);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawingLocked, setDrawingLocked] = useState(true);
  const [canvasReady, setCanvasReady] = useState(false);
  const [gridSize] = useState(0.125); // 1/8" snap precision
  const [majorGridSize] = useState(0.5); // 1/2" major grid blocks
  const [scale, setScale] = useState(80); // pixels per inch (adjustable with Ctrl+scroll zoom)
  const CANVAS_ZOOM_MIN = 30;
  const CANVAS_ZOOM_MAX = 240;
  const [mousePos, setMousePos] = useState<Point | null>(null);
  /** Screen position for custom crosshair cursor (avoids cursor hidden behind canvas on laptops) */
  const [crosshairScreenPos, setCrosshairScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [editMode, setEditMode] = useState<EditMode | null>(null);
  const [hemPreviewMode, setHemPreviewMode] = useState<HemPreviewMode | null>(null);
  /** Hem length in inches (default 1/2"). Used for drawing and material take-off. */
  const [hemDepthInches, setHemDepthInches] = useState(0.5);
  const [angleDisplayMode, setAngleDisplayMode] = useState<Record<string, boolean>>({});
  const [lengthInput, setLengthInput] = useState('');
  const lengthInputRef = useRef<HTMLInputElement>(null);
  /** Bumps on each loadSavedConfigs call so stale/aborted responses don't toast or overwrite state */
  const loadSavedConfigsGenRef = useRef(0);
  const [previewConfig, setPreviewConfig] = useState<SavedConfig | null>(null);
  const [showPriceList, setShowPriceList] = useState(false);
  const [priceListMaterialId, setPriceListMaterialId] = useState<string>('');
  /** Shop / field notes on PDF exports from the live drawing toolbar */
  const [trimPdfShopColor, setTrimPdfShopColor] = useState('');
  /** Price list: configs selected for multi-page PDF */
  const [priceListPdfSelectedIds, setPriceListPdfSelectedIds] = useState<Set<string>>(() => new Set());
  const [showCombineTrimPdfDialog, setShowCombineTrimPdfDialog] = useState(false);
  const [combineTrimPdfDraft, setCombineTrimPdfDraft] = useState<
    {
      configId: string;
      name: string;
      segments: LineSegment[];
      qtyText: string;
      lengthText: string;
      colorText: string;
    }[]
  >([]);
  const BASE_CANVAS_WIDTH = 1400;
  const BASE_CANVAS_HEIGHT = 700;
  const baseW = BASE_CANVAS_WIDTH * (scale / 80);
  const baseH = BASE_CANVAS_HEIGHT * (scale / 80);
  const CANVAS_WIDTH = containerSize ? Math.max(baseW, containerSize.w) : baseW;
  const CANVAS_HEIGHT = containerSize ? Math.max(baseH, containerSize.h) : baseH;

  // Helper function to remove trailing zeros
  function cleanNumber(num: number, decimals: number = 3): string {
    return num.toFixed(decimals).replace(/\.?0+$/, '');
  }

  function roundToNearestEighth(num: number): number {
    return Math.round(num * 8) / 8;
  }

  function formatMeasurementToEighth(num: number): string {
    return cleanNumber(roundToNearestEighth(num), 3);
  }

  /** Choose label side (+/- perpendicular) by available whitespace against nearby segments. */
  function chooseLabelDirectionForSpace(
    segment: LineSegment,
    allSegments: LineSegment[],
    preferredDirection: 1 | -1,
    offsetInches: number
  ): 1 | -1 {
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    const perpX = -dy / len;
    const perpY = dx / len;
    const mid: Point = {
      x: (segment.start.x + segment.end.x) / 2,
      y: (segment.start.y + segment.end.y) / 2,
    };
    const score = (dir: 1 | -1) => {
      const candidate: Point = {
        x: mid.x + perpX * offsetInches * dir,
        y: mid.y + perpY * offsetInches * dir,
      };
      let minDist = Infinity;
      for (const s of allSegments) {
        if (s.id === segment.id) continue;
        minDist = Math.min(minDist, pointToLineDistance(candidate, s.start, s.end));
      }
      return minDist;
    };
    const prefScore = score(preferredDirection);
    const altDir = (preferredDirection === 1 ? -1 : 1) as 1 | -1;
    const altScore = score(altDir);
    if (altScore > prefScore + 0.02) return altDir;
    return preferredDirection;
  }

  // Helper function to draw a hem (optional lineWidthForExport: use same as main lines for PDF)
  function drawHem(
    ctx: CanvasRenderingContext2D, 
    segment: LineSegment, 
    scale: number, 
    isPreview: boolean = false,
    previewSide?: 'left' | 'right',
    lineWidthForExport?: number,
    allSegments: LineSegment[] = []
  ) {
    const hemPoint = segment.hemAtStart ? segment.start : segment.end;
    const otherPoint = segment.hemAtStart ? segment.end : segment.start;
    
    // Calculate direction vector of the main segment
    const dx = otherPoint.x - hemPoint.x;
    const dy = otherPoint.y - hemPoint.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const unitX = dx / length;
    const unitY = dy / length;
    
    // Perpendicular vectors (both left and right)
    const perpRightX = -unitY;
    const perpRightY = unitX;
    const perpLeftX = unitY;
    const perpLeftY = -unitX;
    
    // Determine which side to use (left/right swapped so selection matches visual side)
    const side = isPreview ? previewSide : segment.hemSide || 'right';
    const perpX = side === 'right' ? perpLeftX : perpRightX;
    const perpY = side === 'right' ? perpLeftY : perpRightY;
    
    // Hem: configurable length along the trim, 180° double back; offset from trim by 2 line widths; ends connected
    const hemDepth = getHemDepthForSegment(segment);
    const oneLineWidth = 0.03125; // 1/32"
    const lineWidthOffset = oneLineWidth * 2; // offset more by one line width (2 total)
    const alongX = unitX;
    const alongY = unitY;
    
    const baseX = hemPoint.x + perpX * lineWidthOffset;
    const baseY = hemPoint.y + perpY * lineWidthOffset;
    
    // p0 = trim line end (segment end), p1 = hem base, p2 = tip of 0.5" out
    const p0x = hemPoint.x * scale;
    const p0y = hemPoint.y * scale;
    const p1x = baseX * scale;
    const p1y = baseY * scale;
    const p2x = (baseX + alongX * hemDepth) * scale;
    const p2y = (baseY + alongY * hemDepth) * scale;
    
    if (isPreview) {
      ctx.strokeStyle = '#9333ea';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.setLineDash([5, 5]);
    } else {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = lineWidthForExport ?? 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.setLineDash([]);
    }
    
    // Connect trim end to hem, then 1/2" out and back (ends connected)
    ctx.beginPath();
    ctx.moveTo(p0x, p0y);
    ctx.lineTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.lineTo(p1x, p1y);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Reset stroke style
    ctx.strokeStyle = isPreview ? '#9333ea' : '#000000';
    ctx.lineWidth = isPreview ? 2 : (lineWidthForExport ?? 3);
    
    // Label only in preview mode (no HEM / 0.5" text on final drawing)
    // Small pixel offset from hem mid-leg (p1–p2). Do NOT multiply by `scale` here — perp is a unit
    // vector and p1/p2 are already in canvas px; `perp * N * scale` was pushing labels far off-canvas.
    const hemLabelOffsetPx = Math.max(4, 6 * (scale / 80));
    if (isPreview) {
      ctx.fillStyle = '#9333ea';
      ctx.font = 'bold 14px sans-serif';
      const labelX = (p1x + p2x) / 2 + perpX * hemLabelOffsetPx * 1.5;
      const labelY = (p1y + p2y) / 2 + perpY * hemLabelOffsetPx * 1.5;
      ctx.fillText(`${side.toUpperCase()}?`, labelX - 20, labelY + 5);
    } else if (Math.abs(hemDepth - 0.5) > 1e-6) {
      // For non-default hems, print explicit size on the drawing so shop sees custom hem depth.
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 10px sans-serif';
      const midHemInches = { x: (baseX + (baseX + alongX * hemDepth)) / 2, y: (baseY + (baseY + alongY * hemDepth)) / 2 };
      const offsetInches = hemLabelOffsetPx / scale;
      const score = (sign: 1 | -1) => {
        const candidate: Point = {
          x: midHemInches.x + perpX * offsetInches * sign,
          y: midHemInches.y + perpY * offsetInches * sign,
        };
        let minDist = Infinity;
        for (const s of allSegments) {
          if (s.id === segment.id) continue;
          minDist = Math.min(minDist, pointToLineDistance(candidate, s.start, s.end));
        }
        return minDist;
      };
      const sign: 1 | -1 = score(1) >= score(-1) ? 1 : -1;
      const labelX = (p1x + p2x) / 2 + perpX * hemLabelOffsetPx * sign;
      const labelY = (p1y + p2y) / 2 + perpY * hemLabelOffsetPx * sign;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${cleanNumber(hemDepth)}"`, labelX, labelY);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  // Measure before paint so canvas doesn't flash at base size first.
  // Also avoid resetting to "not ready" on Strict Mode re-runs.
  useLayoutEffect(() => {
    if (!showDrawing) {
      setCanvasReady(false);
      setContainerSize(null);
      return;
    }
    const el = canvasContainerRef.current;
    if (!el) return;
    const updateSize = () => {
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      setContainerSize((prev) => {
        if (prev && Math.abs(prev.w - w) < 0.5 && Math.abs(prev.h - h) < 0.5) return prev;
        return { w, h };
      });
      setCanvasReady(true);
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showDrawing]);

  // Ctrl+scroll to zoom on canvas (non-passive listener so preventDefault works)
  useEffect(() => {
    const el = canvasScrollContainerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setScale((s) => {
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        const next = s * factor;
        return Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, next));
      });
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [canvasReady]);

  // Calculate the centroid of the drawing for intelligent label placement
  function calculateCentroid(segments: LineSegment[]): Point {
    if (segments.length === 0) return { x: 0, y: 0 };
    
    let sumX = 0, sumY = 0, count = 0;
    segments.forEach(seg => {
      sumX += seg.start.x + seg.end.x;
      sumY += seg.start.y + seg.end.y;
      count += 2;
    });
    
    return { x: sumX / count, y: sumY / count };
  }

  /** Hem offset from trim = 2 line widths (must match drawHem). */
  const HEM_LINE_WIDTH_OFFSET = 0.03125 * 2; // 1/16"

  const POINT_MATCH_TOLERANCE = 0.02; // inches - endpoints within this are considered the same (corner)

  function getHemDepthForSegment(segment: LineSegment): number {
    const v = segment.hemDepthInches;
    if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0.125, v);
    return Math.max(0.125, hemDepthInches);
  }

  /** Total material length from segment geometry (includes hem takeoff). */
  function calculateTotalLengthFromSegments(segments: LineSegment[]): number {
    let total = 0;
    for (const segment of segments) {
      const dx = segment.end.x - segment.start.x;
      const dy = segment.end.y - segment.start.y;
      total += Math.sqrt(dx * dx + dy * dy);
      if (segment.hasHem) total += getHemDepthForSegment(segment);
    }
    return total;
  }

  /** True if this end of the segment is not attached to another segment (open end). No hem allowed at corners. */
  function isSegmentEndOpen(segmentId: string, atStart: boolean): boolean {
    const segment = drawing.segments.find(s => s.id === segmentId);
    if (!segment) return false;
    const pt = atStart ? segment.start : segment.end;
    for (const seg of drawing.segments) {
      if (seg.id === segmentId) continue;
      const dStart = Math.sqrt((pt.x - seg.start.x) ** 2 + (pt.y - seg.start.y) ** 2);
      const dEnd = Math.sqrt((pt.x - seg.end.x) ** 2 + (pt.y - seg.end.y) ** 2);
      if (dStart < POINT_MATCH_TOLERANCE || dEnd < POINT_MATCH_TOLERANCE) return false; // corner
    }
    return true;
  }

  /** Non-1/2" hems can be used as attachable returns even on corners. */
  function canPlaceHemAtEnd(segmentId: string, atStart: boolean): boolean {
    if (isSegmentEndOpen(segmentId, atStart)) return true;
    return Math.abs(Math.max(0.125, hemDepthInches) - 0.5) > 1e-6;
  }

  /** Get hem preview tip point in inch coords (for click-to-select hem option). */
  function getHemPreviewTipPoint(segment: LineSegment, hemAtStart: boolean, side: 'left' | 'right'): Point {
    const hemPoint = hemAtStart ? segment.start : segment.end;
    const otherPoint = hemAtStart ? segment.end : segment.start;
    const dx = otherPoint.x - hemPoint.x;
    const dy = otherPoint.y - hemPoint.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    const unitX = dx / length;
    const unitY = dy / length;
    const perpRightX = -unitY;
    const perpRightY = unitX;
    const perpLeftX = unitY;
    const perpLeftY = -unitX;
    const perpX = side === 'right' ? perpLeftX : perpRightX;
    const perpY = side === 'right' ? perpLeftY : perpRightY;
    const hemDepth = getHemDepthForSegment(segment);
    const oneLineWidth = 0.03125 * 2;
    const baseX = hemPoint.x + perpX * oneLineWidth;
    const baseY = hemPoint.y + perpY * oneLineWidth;
    return { x: baseX + unitX * hemDepth, y: baseY + unitY * hemDepth };
  }

  /** Get the "open end" of a hem (where it doubles back — one line width off the segment). Used as a snap point. */
  function getHemOpenEndPoint(segment: LineSegment): Point | null {
    if (!segment.hasHem) return null;
    const hemPoint = segment.hemAtStart ? segment.start : segment.end;
    const otherPoint = segment.hemAtStart ? segment.end : segment.start;
    const dx = otherPoint.x - hemPoint.x;
    const dy = otherPoint.y - hemPoint.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return null;
    const perpRightX = -dy / len;
    const perpRightY = dx / len;
    const perpLeftX = dy / len;
    const perpLeftY = -dx / len;
    const side = segment.hemSide || 'right';
    const perpX = side === 'right' ? perpLeftX : perpRightX;
    const perpY = side === 'right' ? perpLeftY : perpRightY;
    return {
      x: hemPoint.x + perpX * HEM_LINE_WIDTH_OFFSET,
      y: hemPoint.y + perpY * HEM_LINE_WIDTH_OFFSET,
    };
  }

  /** Tip point of the doubled-back hem extension. */
  function getHemTipPoint(segment: LineSegment): Point | null {
    if (!segment.hasHem) return null;
    const hemPoint = segment.hemAtStart ? segment.start : segment.end;
    const otherPoint = segment.hemAtStart ? segment.end : segment.start;
    const dx = otherPoint.x - hemPoint.x;
    const dy = otherPoint.y - hemPoint.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return null;
    const ux = dx / len;
    const uy = dy / len;
    const perpRightX = -uy;
    const perpRightY = ux;
    const perpLeftX = uy;
    const perpLeftY = -ux;
    const side = segment.hemSide || 'right';
    const perpX = side === 'right' ? perpLeftX : perpRightX;
    const perpY = side === 'right' ? perpLeftY : perpRightY;
    const baseX = hemPoint.x + perpX * HEM_LINE_WIDTH_OFFSET;
    const baseY = hemPoint.y + perpY * HEM_LINE_WIDTH_OFFSET;
    const hemDepth = getHemDepthForSegment(segment);
    return { x: baseX + ux * hemDepth, y: baseY + uy * hemDepth };
  }

  /** All points where a new line can attach: segment ends plus hem base/tip points. */
  function getSegmentConnectionPoints(segment: LineSegment): Point[] {
    const points: Point[] = [segment.start, segment.end];
    const hemOpen = getHemOpenEndPoint(segment);
    if (hemOpen) points.push(hemOpen);
    const hemTip = getHemTipPoint(segment);
    if (hemTip) points.push(hemTip);
    return points;
  }

  // Draw canvas
  useEffect(() => {
    if (!canvasRef.current || !showDrawing || !canvasReady) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw grid - two levels: major (1/2") and minor (1/8")
    const minorGridSpacing = gridSize * scale; // 1/8" in pixels
    const majorGridSpacing = majorGridSize * scale; // 1/2" in pixels
    
    // Draw minor grid lines (1/8") - very light grey
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 0.5;
    
    // Vertical minor lines
    for (let x = 0; x <= CANVAS_WIDTH; x += minorGridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }
    
    // Horizontal minor lines
    for (let y = 0; y <= CANVAS_HEIGHT; y += minorGridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }
    
    // Draw major grid lines (1/2") - darker grey, thicker
    ctx.strokeStyle = '#c0c0c0';
    ctx.lineWidth = 2;
    
    // Vertical major lines
    for (let x = 0; x <= CANVAS_WIDTH; x += majorGridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }
    
    // Horizontal major lines
    for (let y = 0; y <= CANVAS_HEIGHT; y += majorGridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }

    // Draw preview line from current point to mouse position
    if (drawing.currentPoint && mousePos && isDrawingMode) {
      const startX = drawing.currentPoint.x * scale;
      const startY = drawing.currentPoint.y * scale;
      const endX = mousePos.x * scale;
      const endY = mousePos.y * scale;
      
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Show preview endpoint
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(endX, endY, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // Calculate and display preview measurement
      const dx = mousePos.x - drawing.currentPoint.x;
      const dy = mousePos.y - drawing.currentPoint.y;
      const previewLength = Math.sqrt(dx * dx + dy * dy);
      
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      
      // Background for measurement
      ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
      ctx.fillRect(midX - 36, midY - 26, 72, 20);
      
      // Measurement text (no trailing zeros)
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${formatMeasurementToEighth(previewLength)}`, midX, midY - 12);
      
      // Calculate and display preview angle (if not first segment)
      if (drawing.segments.length > 0) {
        const lastSegment = drawing.segments[drawing.segments.length - 1];
        const dx1 = lastSegment.end.x - lastSegment.start.x;
        const dy1 = lastSegment.end.y - lastSegment.start.y;
        const dx2 = mousePos.x - drawing.currentPoint.x;
        const dy2 = mousePos.y - drawing.currentPoint.y;
        
        const angle1 = Math.atan2(dy1, dx1) * 180 / Math.PI;
        const angle2 = Math.atan2(dy2, dx2) * 180 / Math.PI;
        
        let angleDiff = angle2 - angle1;
        if (angleDiff < 0) angleDiff += 360;
        if (angleDiff > 360) angleDiff -= 360;
        const previewInterior = Math.min(angleDiff, 360 - angleDiff);
        
        // Angle text: blue with degree symbol (match final trim drawing style)
        ctx.fillStyle = '#2563eb';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${Math.round(previewInterior)}°`, startX + 10, startY - 22);
      }
      
      ctx.textAlign = 'left';
    }

    // Draw mode indicator
    if (!isDrawingMode) {
      if (drawing.segments.length === 0) {
        ctx.fillStyle = '#666666';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Click "Draw" button to start drawing', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.textAlign = 'left';
      } else if (!drawing.selectedSegmentId) {
        ctx.fillStyle = '#666666';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Click on a line to edit it', CANVAS_WIDTH / 2, 30);
        ctx.textAlign = 'left';
      }
    } else if (isDrawingMode && !drawing.currentPoint) {
      // Highlight all connection points when in drawing mode (endpoints + hem open ends)
      ctx.fillStyle = '#10b981';
      drawing.segments.forEach(seg => {
        // Highlight start point
        ctx.beginPath();
        ctx.arc(seg.start.x * scale, seg.start.y * scale, 8, 0, Math.PI * 2);
        ctx.fill();
        // Highlight end point
        ctx.beginPath();
        ctx.arc(seg.end.x * scale, seg.end.y * scale, 8, 0, Math.PI * 2);
        ctx.fill();
        // Highlight hem base and tip so user can attach lines to the doubled-back feature
        const hemOpen = getHemOpenEndPoint(seg);
        if (hemOpen) {
          ctx.fillStyle = '#059669'; // Slightly different green for hem open end
          ctx.beginPath();
          ctx.arc(hemOpen.x * scale, hemOpen.y * scale, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#10b981';
        }
        const hemTip = getHemTipPoint(seg);
        if (hemTip) {
          ctx.fillStyle = '#047857';
          ctx.beginPath();
          ctx.arc(hemTip.x * scale, hemTip.y * scale, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#10b981';
        }
      });
    }

    // Calculate centroid for intelligent placement
    const centroid = calculateCentroid(drawing.segments);

    // Draw segments with intelligent text placement
    drawing.segments.forEach((segment, segmentIndex) => {
      const isSelected = segment.id === drawing.selectedSegmentId;
      
      // Convert inches to pixels
      const startX = segment.start.x * scale;
      const startY = segment.start.y * scale;
      const endX = segment.end.x * scale;
      const endY = segment.end.y * scale;

      // Draw line
      ctx.strokeStyle = isSelected ? '#EAB308' : '#000000';
      ctx.lineWidth = isSelected ? 4 : 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Draw hem if exists (U-shaped fold - no exposed edge). No degree label at hems.
      if (segment.hasHem) {
        drawHem(ctx, segment, scale, false, undefined, undefined, drawing.segments);
      }

      // Calculate measurements
      const dx = segment.end.x - segment.start.x;
      const dy = segment.end.y - segment.start.y;
      const lengthInInches = Math.sqrt(dx * dx + dy * dy);
      
      // Mid point
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      
      // Calculate perpendicular direction
      const length = Math.sqrt(dx * dx + dy * dy);
      const perpX = -dy / length || 0;
      const perpY = dx / length || 0;
      
      // Determine which side is "outside" (away from centroid)
      const midPointInInches = {
        x: (segment.start.x + segment.end.x) / 2,
        y: (segment.start.y + segment.end.y) / 2
      };
      const toCentroidX = centroid.x - midPointInInches.x;
      const toCentroidY = centroid.y - midPointInInches.y;
      
      // Dot product to determine which perpendicular direction is away from centroid
      const dotProduct = perpX * toCentroidX + perpY * toCentroidY;
      const preferredDirection: 1 | -1 = (dotProduct > 0 ? -1 : 1); // Flip if pointing toward centroid
      
      // Adjusted perpendicular (pointing away from shape)
      const isShortSegment = lengthInInches < 1.0;
      const stackOffset = isShortSegment ? 26 : 18; // px perpendicular from segment midpoint
      const chosenDirection = chooseLabelDirectionForSpace(
        segment,
        drawing.segments,
        preferredDirection,
        stackOffset / scale
      );
      const outwardPerpX = perpX * chosenDirection;
      const outwardPerpY = perpY * chosenDirection;
      
      // STACKED LABELS: Label on top, measurement below — keep close to the line (tighter than spec PDFs)
      // Base position (perpendicular from midpoint)
      const baseX = midX + outwardPerpX * stackOffset;
      const baseY = midY + outwardPerpY * stackOffset;
      
      // Draw segment label (lighter gray, smaller, on top)
      ctx.fillStyle = '#999999';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(segment.label, baseX, baseY - 5);
      
      // Draw measurement (bold black, below label)
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${formatMeasurementToEighth(lengthInInches)}`, baseX, baseY + 5);
      ctx.textAlign = 'left';

      // Draw angle label if not first segment — outside of bend (bisector of reflex wedge)
      if (segmentIndex > 0) {
        const prevSegment = drawing.segments[segmentIndex - 1];
        const angle = calculateAngleBetweenSegments(prevSegment, segment);
        
        const useComplement = angleDisplayMode[segment.id] || false;
        const displayAngle = useComplement ? (360 - angle) : angle;
        
        const exteriorBisector = getOutsideBendAngleLabelBisectorRad(prevSegment, segment);
        const angleDistance = 28;
        const angleX = startX + Math.cos(exteriorBisector) * angleDistance;
        const angleY = startY + Math.sin(exteriorBisector) * angleDistance;

        // Degree label: blue text with ° symbol (standard trim drawing style)
        ctx.fillStyle = '#2563eb';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(displayAngle)}°`, angleX, angleY);
        ctx.textAlign = 'left';
      }
    });



    // Draw hem preview options at open ends; allow corners when hem length is not 1/2"
    if (hemPreviewMode) {
      const segment = drawing.segments.find(s => s.id === hemPreviewMode.segmentId);
      if (segment) {
        if (canPlaceHemAtEnd(segment.id, true)) {
          drawHem(ctx, { ...segment, hasHem: true, hemAtStart: true }, scale, true, 'left', undefined, drawing.segments);
          drawHem(ctx, { ...segment, hasHem: true, hemAtStart: true }, scale, true, 'right', undefined, drawing.segments);
        }
        if (canPlaceHemAtEnd(segment.id, false)) {
          drawHem(ctx, { ...segment, hasHem: true, hemAtStart: false }, scale, true, 'left', undefined, drawing.segments);
          drawHem(ctx, { ...segment, hasHem: true, hemAtStart: false }, scale, true, 'right', undefined, drawing.segments);
        }
      }
    }

    // Draw current point (while drawing) - make it more visible
    if (drawing.currentPoint) {
      const x = drawing.currentPoint.x * scale;
      const y = drawing.currentPoint.y * scale;
      
      // Outer ring
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.stroke();
      
      // Inner fill
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // "Colour Side" markers removed - no blue dot at starting point
  }, [drawing, showDrawing, canvasReady, scale, gridSize, majorGridSize, CANVAS_WIDTH, CANVAS_HEIGHT, isDrawingMode, mousePos, drawingLocked, hemPreviewMode, angleDisplayMode, hemDepthInches]);

  function pointToLineDistance(point: Point, lineStart: Point, lineEnd: Point): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) return Math.sqrt(
      (point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2
    );
    
    const t = Math.max(0, Math.min(1, (
      (point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy
    ) / (length * length)));
    
    const projX = lineStart.x + t * dx;
    const projY = lineStart.y + t * dy;
    
    return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
  }

  /** Normalized CCW turn from seg1 direction to seg2 direction, degrees in [0, 360). */
  function getRawTurnDegrees(seg1: LineSegment, seg2: LineSegment): number {
    const dx1 = seg1.end.x - seg1.start.x;
    const dy1 = seg1.end.y - seg1.start.y;
    const dx2 = seg2.end.x - seg2.start.x;
    const dy2 = seg2.end.y - seg2.start.y;
    const angle1 = Math.atan2(dy1, dx1) * 180 / Math.PI;
    const angle2 = Math.atan2(dy2, dx2) * 180 / Math.PI;
    let diff = angle2 - angle1;
    if (diff < 0) diff += 360;
    if (diff > 360) diff -= 360;
    return diff;
  }

  /** Smaller angle between the two segment directions (≤180°). Avoids showing 270° for a 90° bend. */
  function calculateAngleBetweenSegments(seg1: LineSegment, seg2: LineSegment): number {
    const turn = getRawTurnDegrees(seg1, seg2);
    return Math.min(turn, 360 - turn);
  }

  /** Map edited interior angle back to an actual path turn, preserving winding vs previous geometry. */
  function resolveTurnFromInterior(prevTurn: number, interior: number): number {
    const a = interior;
    const b = 360 - interior;
    const circularDist = (x: number, y: number) => {
      const d = Math.abs(x - y) % 360;
      return Math.min(d, 360 - d);
    };
    return circularDist(a, prevTurn) <= circularDist(b, prevTurn) ? a : b;
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!canvasRef.current) return;
    setCrosshairScreenPos({ x: e.clientX, y: e.clientY });
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = ((e.clientX - rect.left) * scaleX) / scale;
    const y = ((e.clientY - rect.top) * scaleY) / scale;
    
    // Snap to grid
    const snappedX = Math.round(x / gridSize) * gridSize;
    const snappedY = Math.round(y / gridSize) * gridSize;
    
    setMousePos({ x: snappedX, y: snappedY });
  }

  const HEM_PREVIEW_CLICK_TOLERANCE = 0.45; // inches - click near a hem preview to choose that option

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    // Convert click from display pixels to canvas/inch coords (canvas may be CSS-scaled)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = ((e.clientX - rect.left) * scaleX) / scale;
    const clickY = ((e.clientY - rect.top) * scaleY) / scale;
    
    // When in hem preview mode: click on a hem option (open ends only, left/right) to apply it
    if (hemPreviewMode) {
      const segment = drawing.segments.find(s => s.id === hemPreviewMode.segmentId);
      if (segment) {
        const options: { hemAtStart: boolean; side: 'left' | 'right' }[] = [];
        if (canPlaceHemAtEnd(segment.id, true)) {
          options.push({ hemAtStart: true, side: 'left' }, { hemAtStart: true, side: 'right' });
        }
        if (canPlaceHemAtEnd(segment.id, false)) {
          options.push({ hemAtStart: false, side: 'left' }, { hemAtStart: false, side: 'right' });
        }
        for (const { hemAtStart, side } of options) {
          const tip = getHemPreviewTipPoint(segment, hemAtStart, side);
          const dist = Math.sqrt((clickX - tip.x) ** 2 + (clickY - tip.y) ** 2);
          if (dist < HEM_PREVIEW_CLICK_TOLERANCE) {
            addHemToSide(side, hemAtStart);
            return;
          }
        }
      }
    }
    
    // When finishing a line (currentPoint set), don't treat clicks as angle-toggle or segment-select — let them complete the segment
    const isFinishingLine = isDrawingMode && drawing.currentPoint != null;

    // Check if user clicked on an angle label to toggle it (skip when finishing a line so click sets the endpoint)
    if (!isFinishingLine) {
      for (let i = 1; i < drawing.segments.length; i++) {
        const segment = drawing.segments[i];
        const prevSegment = drawing.segments[i - 1];
        
        const startX = segment.start.x * scale;
        const startY = segment.start.y * scale;
        const exteriorBisector = getOutsideBendAngleLabelBisectorRad(prevSegment, segment);
        const angleDistance = 28;
        const angleX = startX + Math.cos(exteriorBisector) * angleDistance;
        const angleY = startY + Math.sin(exteriorBisector) * angleDistance;

        const clickPixelX = (e.clientX - rect.left) * scaleX;
        const clickPixelY = (e.clientY - rect.top) * scaleY;
        const distToAngle = Math.sqrt(
          (clickPixelX - angleX) ** 2 + (clickPixelY - angleY) ** 2
        );
        
        if (distToAngle < 20) {
          setAngleDisplayMode(prev => ({
            ...prev,
            [segment.id]: !prev[segment.id]
          }));
          toast.info('Angle view toggled');
          return;
        }
      }
    }

    // In drawing mode, when not placing a line: clicking near any attach point should start drawing,
    // not toggle hem/segment selection.
    const endpointSnapTolerance = 0.65;
    let nearAnyConnectionPoint = false;
    if (isDrawingMode && !drawing.currentPoint) {
      for (const seg of drawing.segments) {
        const connectionPoints = getSegmentConnectionPoints(seg);
        if (connectionPoints.some((p) => Math.sqrt((clickX - p.x) ** 2 + (clickY - p.y) ** 2) < endpointSnapTolerance)) {
          nearAnyConnectionPoint = true;
          break;
        }
      }
    }
    if (isDrawingMode && !drawing.currentPoint && !nearAnyConnectionPoint) {
      for (let i = drawing.segments.length - 1; i >= 0; i--) {
        const seg = drawing.segments[i];
        const distToLine = pointToLineDistance({ x: clickX, y: clickY }, seg.start, seg.end);
        if (distToLine >= 0.5) continue;
        const connectionPoints = getSegmentConnectionPoints(seg);
        const nearEndpoint = connectionPoints.some(
          (p) => Math.sqrt((clickX - p.x) ** 2 + (clickY - p.y) ** 2) < endpointSnapTolerance
        );
        if (nearEndpoint) continue;
        selectSegment(seg.id);
        if (seg.hasHem) {
          setDrawing(prev => ({
            ...prev,
            segments: prev.segments.map(s =>
              s.id === seg.id ? { ...s, hasHem: false, hemAtStart: false, hemSide: undefined, hemDepthInches: undefined } : s
            )
          }));
          toast.success('Hem removed');
        } else {
          const startAllowed = canPlaceHemAtEnd(seg.id, true);
          const endAllowed = canPlaceHemAtEnd(seg.id, false);
          if (startAllowed || endAllowed) {
            startHemPreview(seg.id);
          } else {
            toast.info('This segment has no open end. Use a non-1/2 hem length to allow corner hems, or pick an unattached end.');
          }
        }
        return;
      }
    }
    
    // If not in drawing mode, check if user clicked on a segment to select it
    if (!isDrawingMode) {
      // Find if user clicked near any segment
      for (let i = drawing.segments.length - 1; i >= 0; i--) {
        const seg = drawing.segments[i];
        const dist = pointToLineDistance(
          { x: clickX, y: clickY },
          seg.start,
          seg.end
        );
        
        if (dist < 0.5) { // Within 0.5" of the line
          selectSegment(seg.id);
          return;
        }
      }
      
      // Deselect if clicked on empty space
      setDrawing(prev => ({ ...prev, selectedSegmentId: null }));
      return;
    }
    
    // Drawing mode - add new points
    // First check if user clicked near an existing endpoint to snap to it
    const snapTolerance = 0.55; // inches - hem open/tip points are offset and need easier snapping
    let snappedToEndpoint = false;
    let point: Point = { x: 0, y: 0 };
    let nearest: { p: Point; dist: number } | null = null;
    for (const seg of drawing.segments) {
      const connectionPoints = getSegmentConnectionPoints(seg);
      for (const p of connectionPoints) {
        const dist = Math.sqrt((clickX - p.x) ** 2 + (clickY - p.y) ** 2);
        if (dist < snapTolerance && (!nearest || dist < nearest.dist)) {
          nearest = { p, dist };
        }
      }
    }
    if (nearest) {
      point = { x: nearest.p.x, y: nearest.p.y };
      snappedToEndpoint = true;
    }

    // If not snapped to endpoint, snap to grid
    if (!snappedToEndpoint) {
      const snappedX = Math.round(clickX / gridSize) * gridSize;
      const snappedY = Math.round(clickY / gridSize) * gridSize;
      point = { x: snappedX, y: snappedY };
    }

    // When trim has started, only the *start* of a new line must be on an endpoint; the end can be placed anywhere (grid or endpoint)
    const trimStarted = drawing.segments.length > 0;
    if (trimStarted && !drawing.currentPoint && !snappedToEndpoint) {
      return;
    }

    if (!drawing.currentPoint) {
      // Start new line
      setDrawing(prev => ({ ...prev, currentPoint: point }));
      setLengthInput(''); // Clear length input when starting new line
      // Focus the length input after a short delay to allow state to update
      setTimeout(() => lengthInputRef.current?.focus(), 100);
    } else {
      // Complete line (end point can be anywhere — grid or endpoint) and STAY in drawing mode
      const newSegment: LineSegment = {
        id: Date.now().toString(),
        start: drawing.currentPoint,
        end: point,
        label: String.fromCharCode(drawing.nextLabel),
        hasHem: false,
        hemAtStart: false
      };
      pushDrawingHistory();
      setDrawing(prev => ({
        segments: [...prev.segments, newSegment],
        currentPoint: null, // Clear current point to allow starting next line
        selectedSegmentId: null,
        nextLabel: prev.nextLabel + 1
      }));

      setLengthInput(''); // Clear length input after completing line

      // STAY in drawing mode - user can continue adding lines
      toast.success('Line added - click endpoint to continue or on an existing endpoint to start new');
    }
  }

  function selectSegment(segmentId: string) {
    setDrawing(prev => ({ ...prev, selectedSegmentId: segmentId }));
  }

  function pushDrawingHistory() {
    setDrawingHistory(prev => {
      const snapshot: DrawingState = {
        segments: drawing.segments.map(seg => ({
          ...seg,
          start: { x: seg.start.x, y: seg.start.y },
          end: { x: seg.end.x, y: seg.end.y },
        })),
        selectedSegmentId: drawing.selectedSegmentId,
        currentPoint: drawing.currentPoint ? { x: drawing.currentPoint.x, y: drawing.currentPoint.y } : null,
        nextLabel: drawing.nextLabel,
      };
      const next = [...prev, snapshot].slice(-MAX_DRAWING_HISTORY);
      return next;
    });
  }

  function undoDrawing() {
    if (drawingHistory.length === 0) return;
    const last = drawingHistory[drawingHistory.length - 1];
    setDrawing({
      segments: last.segments.map(seg => ({
        ...seg,
        start: { x: seg.start.x, y: seg.start.y },
        end: { x: seg.end.x, y: seg.end.y },
      })),
      selectedSegmentId: last.selectedSegmentId,
      currentPoint: last.currentPoint ? { x: last.currentPoint.x, y: last.currentPoint.y } : null,
      nextLabel: last.nextLabel,
    });
    setDrawingHistory(prev => prev.slice(0, -1));
    setEditMode(null);
    toast.success('Undo');
  }

  function deleteSelectedSegment() {
    if (!drawing.selectedSegmentId) {
      toast.error('No segment selected');
      return;
    }
    pushDrawingHistory();
    setDrawing(prev => ({
      ...prev,
      segments: prev.segments.filter(s => s.id !== prev.selectedSegmentId),
      selectedSegmentId: null
    }));
    toast.success('Segment deleted');
  }

  function startEditMode(segmentId: string) {
    const segment = drawing.segments.find(s => s.id === segmentId);
    if (!segment) return;
    
    // Calculate current measurement
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    const measurement = Math.sqrt(dx * dx + dy * dy);
    
    // Use the same angle as shown on the drawing (including complement if toggled)
    const segmentIndex = drawing.segments.indexOf(segment);
    let angle = 0;
    if (segmentIndex > 0) {
      const prevSegment = drawing.segments[segmentIndex - 1];
      const interiorAngle = calculateAngleBetweenSegments(prevSegment, segment);
      const useComplement = angleDisplayMode[segment.id] || false;
      angle = useComplement ? 360 - interiorAngle : interiorAngle;
    }
    
    setEditMode({
      segmentId,
      measurement: formatMeasurementToEighth(measurement),
      angle: Math.round(angle).toString()
    });
  }

  function applyEdit() {
    if (!editMode) return;
    
    const newMeasurementRaw = parseFloat(editMode.measurement);
    const newMeasurement = roundToNearestEighth(newMeasurementRaw);
    let newAngle = parseFloat(editMode.angle);
    
    if (isNaN(newMeasurementRaw) || newMeasurementRaw <= 0) {
      toast.error('Please enter a valid measurement');
      return;
    }
    
    const segmentIndex = drawing.segments.findIndex(s => s.id === editMode.segmentId);
    if (segmentIndex === -1) return;
    
    const segment = drawing.segments[segmentIndex];
    const oldEnd = segment.end;
    // If drawing shows complement for this segment, edit box value is complement — convert back to interior for math
    if (segmentIndex > 0 && angleDisplayMode[segment.id]) {
      newAngle = 360 - newAngle;
    }
    
    // Calculate new endpoint based on measurement and angle
    let angleRadians: number;
    let snappedEndX: number;
    let snappedEndY: number;
    
    if (segmentIndex === 0) {
      // First segment - use angle from horizontal (0 = +X, 90 = +Y)
      angleRadians = (newAngle * Math.PI) / 180;
      const newEndX = segment.start.x + newMeasurement * Math.cos(angleRadians);
      const newEndY = segment.start.y + newMeasurement * Math.sin(angleRadians);
      snappedEndX = Math.round(newEndX / gridSize) * gridSize;
      snappedEndY = Math.round(newEndY / gridSize) * gridSize;
    } else {
      // Not first segment: interior is min(turn, 360-turn); recover actual path turn from previous geometry.
      const prevSegment = drawing.segments[segmentIndex - 1];
      const prevDx = prevSegment.end.x - prevSegment.start.x;
      const prevDy = prevSegment.end.y - prevSegment.start.y;
      const prevAngleRad = Math.atan2(prevDy, prevDx);
      const prevTurn = getRawTurnDegrees(prevSegment, segment);
      const turnDegrees = resolveTurnFromInterior(prevTurn, newAngle);
      angleRadians = prevAngleRad + (turnDegrees * Math.PI / 180);
      const newEndX = segment.start.x + newMeasurement * Math.cos(angleRadians);
      const newEndY = segment.start.y + newMeasurement * Math.sin(angleRadians);
      snappedEndX = Math.round(newEndX / gridSize) * gridSize;
      snappedEndY = Math.round(newEndY / gridSize) * gridSize;
    }
    
    pushDrawingHistory();
    const updatedSegments = drawing.segments.map((s, i) => ({ ...s, start: { ...s.start }, end: { ...s.end } }));
    updatedSegments[segmentIndex] = {
      ...updatedSegments[segmentIndex],
      end: { x: snappedEndX, y: snappedEndY }
    };
    
    // Keep chain connected: the vertex we moved is segment[segmentIndex].end = start of segment[segmentIndex+1].
    // Translate all later segments by the same displacement so they stay attached.
    const deltaX = snappedEndX - oldEnd.x;
    const deltaY = snappedEndY - oldEnd.y;
    for (let j = segmentIndex + 1; j < updatedSegments.length; j++) {
      updatedSegments[j].start.x += deltaX;
      updatedSegments[j].start.y += deltaY;
      updatedSegments[j].end.x += deltaX;
      updatedSegments[j].end.y += deltaY;
    }
    
    setDrawing(prev => ({ ...prev, segments: updatedSegments }));
    setEditMode(null);
    toast.success('Segment updated');
  }

  function stopDrawing() {
    setDrawing(prev => ({ ...prev, currentPoint: null }));
    setIsDrawingMode(false);
    setDrawingLocked(true);
    setLengthInput('');
    toast.success('Drawing mode ended');
  }

  function handleLengthInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && drawing.currentPoint && mousePos) {
      const targetLengthRaw = parseFloat(lengthInput);
      const targetLength = roundToNearestEighth(targetLengthRaw);
      
      if (isNaN(targetLengthRaw) || targetLengthRaw <= 0) {
        toast.error('Please enter a valid length');
        return;
      }
      
      // Calculate direction from current point to mouse position
      const dx = mousePos.x - drawing.currentPoint.x;
      const dy = mousePos.y - drawing.currentPoint.y;
      const currentLength = Math.sqrt(dx * dx + dy * dy);
      
      if (currentLength === 0) {
        toast.error('Move mouse to set direction first');
        return;
      }
      
      // Calculate unit direction vector
      const unitX = dx / currentLength;
      const unitY = dy / currentLength;
      
      // Calculate endpoint at exact target length
      const endX = drawing.currentPoint.x + unitX * targetLength;
      const endY = drawing.currentPoint.y + unitY * targetLength;
      
      // Snap to grid
      const snappedEndX = Math.round(endX / gridSize) * gridSize;
      const snappedEndY = Math.round(endY / gridSize) * gridSize;
      const endPoint = { x: snappedEndX, y: snappedEndY };
      
      // Create the segment
      const newSegment: LineSegment = {
        id: Date.now().toString(),
        start: drawing.currentPoint,
        end: endPoint,
        label: String.fromCharCode(drawing.nextLabel),
        hasHem: false,
        hemAtStart: false
      };
      pushDrawingHistory();
      setDrawing(prev => ({
        segments: [...prev.segments, newSegment],
        currentPoint: null,
        selectedSegmentId: null,
        nextLabel: prev.nextLabel + 1
      }));
      
      setLengthInput('');
      toast.success(`Line created: ${formatMeasurementToEighth(targetLength)}`);
    }
  }

  function startHemPreview(segmentIdOverride?: string) {
    const segmentId = segmentIdOverride ?? drawing.selectedSegmentId ?? drawing.segments[drawing.segments.length - 1]?.id;
    
    if (!segmentId) {
      toast.error('Draw at least one segment, then select it (or leave it selected) and click Add Hem.');
      return;
    }
    
    const segment = drawing.segments.find(s => s.id === segmentId);
    if (!segment) return;
    
    if (segment.hasHem) {
      // Remove hem if already exists
      setDrawing(prev => ({
        ...prev,
        segments: prev.segments.map(seg =>
          seg.id === segmentId
            ? { ...seg, hasHem: false, hemAtStart: false, hemSide: undefined, hemDepthInches: undefined }
            : seg
        )
      }));
      toast.success('Hem removed');
      return;
    }

    const startAllowed = canPlaceHemAtEnd(segment.id, true);
    const endAllowed = canPlaceHemAtEnd(segment.id, false);
    if (!startAllowed && !endAllowed) {
      toast.error('This segment has no open end. Set hem length above 1/2 to allow corner hems, or pick an unattached end.');
      return;
    }

    // Default to first available open end: prefer end, then start
    const defaultAtStart = !endAllowed && startAllowed;
    setDrawing(prev => ({ ...prev, selectedSegmentId: segmentId }));
    setHemPreviewMode({ segmentId, hemAtStart: defaultAtStart });
    toast.info(`Click a purple hem on the drawing to choose end and side, or use the buttons above`);
  }

  function addHemToSide(side: 'left' | 'right', atStart?: boolean) {
    const mode = hemPreviewMode;
    if (!mode) return;
    const hemAtStart = atStart !== undefined ? atStart : mode.hemAtStart;
    pushDrawingHistory();
    setDrawing(prev => ({
      ...prev,
      segments: prev.segments.map(seg =>
        seg.id === mode.segmentId
          ? { ...seg, hasHem: true, hemAtStart, hemSide: side, hemDepthInches: Math.max(0.125, hemDepthInches) }
          : seg
      )
    }));
    setHemPreviewMode(null);
    toast.success(`Hem added to ${side} side`);
  }

  function setHemPreviewEnd(atStart: boolean) {
    if (!hemPreviewMode) return;
    setHemPreviewMode({ ...hemPreviewMode, hemAtStart: atStart });
  }

  function cancelHemPreview() {
    setHemPreviewMode(null);
  }

  function zoomIn() {
    setScale(prev => Math.min(prev + 20, 200));
  }

  function zoomOut() {
    setScale(prev => Math.max(prev - 20, 40));
  }

  function resetZoom() {
    setScale(80);
  }

  function closeDrawing() {
    if (drawing.segments.length > 0) {
      if (!confirm('Close drawing? Your progress will be lost unless you apply it to the calculator first.')) {
        return;
      }
    }
    setShowDrawing(false);
    setDrawing({
      segments: [],
      selectedSegmentId: null,
      currentPoint: null,
      nextLabel: 65
    });
  }

  function clearDrawing() {
    if (drawing.segments.length > 0 && !confirm('Clear all segments?')) return;

    pushDrawingHistory();
    setDrawing({
      segments: [],
      selectedSegmentId: null,
      currentPoint: null,
      nextLabel: 65
    });
  }

  /** Draw trim only (no grid, no helper text) to ctx, scaled to fit width x height. Used for PDF export. */
  function drawTrimToPdfCanvas(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    segments: LineSegment[],
    angleDisplayModeRecord: Record<string, boolean>
  ) {
    if (segments.length === 0) return;
    const pad = 0.5; // inch padding around bbox
    const points: Point[] = [];
    segments.forEach(seg => {
      points.push(seg.start, seg.end);
      if (seg.hasHem) {
        const hemPoint = seg.hemAtStart ? seg.start : seg.end;
        const other = seg.hemAtStart ? seg.end : seg.start;
        const dx = other.x - hemPoint.x, dy = other.y - hemPoint.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len, uy = dy / len;
        const perpX = (seg.hemSide === 'right' ? uy : -uy);
        const perpY = (seg.hemSide === 'right' ? -ux : ux);
        const lw = 0.03125 * 2;
        const baseX = hemPoint.x + perpX * lw, baseY = hemPoint.y + perpY * lw;
        const hemDepth = getHemDepthForSegment(seg);
        points.push({ x: baseX + ux * hemDepth, y: baseY + uy * hemDepth });
      }
    });
    // Include angle label position in bbox so degree is not cut off
    const angleDistInches = 28 / 80; // offset for angle label so bbox includes it
    const centroid = calculateCentroid(segments);
    segments.forEach((segment, segmentIndex) => {
      if (segmentIndex > 0) {
        const prevSegment = segments[segmentIndex - 1];
        const exteriorBisector = getOutsideBendAngleLabelBisectorRad(prevSegment, segment);
        const cornerX = segment.start.x;
        const cornerY = segment.start.y;
        points.push({
          x: cornerX + Math.cos(exteriorBisector) * angleDistInches,
          y: cornerY + Math.sin(exteriorBisector) * angleDistInches
        });
      }
    });
    const minX = Math.min(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y));
    const maxX = Math.max(...points.map(p => p.x));
    const maxY = Math.max(...points.map(p => p.y));
    const boxW = maxX - minX + 2 * pad;
    const boxH = maxY - minY + 2 * pad;
    const scale = Math.min((width - 1) / boxW, (height - 1) / boxH);
    const contentW = boxW * scale;
    const contentH = boxH * scale;
    const originX = (width - contentW) / 2 + (pad - minX) * scale;
    const originY = (height - contentH) / 2 + (pad - minY) * scale;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(originX, originY);

    const mainLineWidth = Math.max(2, 3 * (scale / 80));
    const labelMeasurementGap = 7; // px between segment letter (A, B) and length — tight to line
    segments.forEach((segment, segmentIndex) => {
      const startX = segment.start.x * scale;
      const startY = segment.start.y * scale;
      const endX = segment.end.x * scale;
      const endY = segment.end.y * scale;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = mainLineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      if (segment.hasHem) drawHem(ctx, segment, scale, false, undefined, mainLineWidth, segments);

      const dx = segment.end.x - segment.start.x;
      const dy = segment.end.y - segment.start.y;
      const lengthInInches = Math.sqrt(dx * dx + dy * dy);
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      const length = lengthInInches || 1;
      const perpX = -dy / length;
      const perpY = dx / length;
      const toCentroidX = centroid.x - (segment.start.x + segment.end.x) / 2;
      const toCentroidY = centroid.y - (segment.start.y + segment.end.y) / 2;
      const stackOffset = lengthInInches < 1.0 ? 26 : 18;
      const preferredDirection: 1 | -1 = (perpX * toCentroidX + perpY * toCentroidY > 0 ? -1 : 1);
      const chosenDirection = chooseLabelDirectionForSpace(
        segment,
        segments,
        preferredDirection,
        stackOffset / scale
      );
      const outwardPerpX = perpX * chosenDirection;
      const outwardPerpY = perpY * chosenDirection;
      const baseX = midX + outwardPerpX * stackOffset;
      const baseY = midY + outwardPerpY * stackOffset;
      const fontSize = Math.max(8, 9 * (scale / 80));
      const fontBold = Math.max(10, 11 * (scale / 80));
      ctx.fillStyle = '#999999';
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(segment.label, baseX, baseY - labelMeasurementGap);
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${fontBold}px sans-serif`;
      ctx.fillText(`${formatMeasurementToEighth(lengthInInches)}`, baseX, baseY + labelMeasurementGap);

      if (segmentIndex > 0) {
        const prevSegment = segments[segmentIndex - 1];
        const angle = calculateAngleBetweenSegments(prevSegment, segment);
        const useComplement = angleDisplayModeRecord[segment.id] || false;
        const displayAngle = useComplement ? (360 - angle) : angle;
        const exteriorBisector = getOutsideBendAngleLabelBisectorRad(prevSegment, segment);
        const angleDist = 28 * (scale / 80);
        const angleX = startX + Math.cos(exteriorBisector) * angleDist;
        const angleY = startY + Math.sin(exteriorBisector) * angleDist;
        // Degree label: blue text with ° symbol (match on-screen trim drawing style)
        ctx.fillStyle = '#2563eb';
        ctx.font = `bold ${Math.max(10, fontSize)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(displayAngle)}°`, angleX, angleY);
      }
    });
    ctx.textAlign = 'left';
    ctx.restore();
  }

  function addTrimDrawingPageToPdf(
    doc: TrimPdfDoc,
    isFirstPage: boolean,
    options: {
      segments: LineSegment[];
      angleDisplayModeRecord: Record<string, boolean>;
      title: string;
      lengthDisplay: string;
      colorDisplay: string;
      /** When set, printed on PDF (combined pack). Omitted for single-drawing exports. */
      qtyDisplay?: string;
    }
  ) {
    const { segments, angleDisplayModeRecord, title, lengthDisplay, colorDisplay, qtyDisplay } = options;
    if (segments.length === 0) return;
    if (!isFirstPage) doc.addPage();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    const textW = pageW - margin * 2;
    let y = margin + 14;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    const titleLines = doc.splitTextToSize(title.trim() || 'Trim drawing', textW);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 16 + 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    if (qtyDisplay !== undefined) {
      doc.text(`Qty: ${qtyDisplay.trim() ? qtyDisplay.trim() : '—'}`, margin, y);
      y += 15;
    }
    doc.text(`Length: ${lengthDisplay.trim() || '—'}`, margin, y);
    y += 15;
    doc.text(`Color: ${colorDisplay.trim() ? colorDisplay.trim() : '—'}`, margin, y);
    y += 22;
    const headerBottom = y;
    const pdfW = textW;
    const pdfH = Math.max(120, pageH - headerBottom - margin);
    const dpr = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(pdfW * dpr);
    canvas.height = Math.floor(pdfH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    drawTrimToPdfCanvas(ctx, canvas.width, canvas.height, segments, angleDisplayModeRecord);
    const imgData = canvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', margin, headerBottom, pdfW, pdfH);
  }

  async function exportTrimDrawingAsPdfFile(
    segments: LineSegment[],
    angleDisplayModeRecord: Record<string, boolean>,
    filename: string,
    meta: { title: string; lengthDisplay: string; colorDisplay: string }
  ) {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF('p', 'pt', 'letter') as unknown as TrimPdfDoc;
    addTrimDrawingPageToPdf(doc, true, { segments, angleDisplayModeRecord, ...meta });
    doc.save(filename);
  }

  async function handleSaveTrimDrawingPDF() {
    if (drawing.segments.length === 0) {
      toast.error('Draw at least one segment before saving as PDF.');
      return;
    }
    try {
      toast.loading('Saving PDF...', { id: 'trim-pdf' });
      const filename = `Trim-Drawing-${new Date().toISOString().slice(0, 10)}.pdf`;
      const totalLen = calculateTotalLengthFromSegments(drawing.segments);
      await exportTrimDrawingAsPdfFile(drawing.segments, angleDisplayMode, filename, {
        title: configName.trim() || 'Trim drawing',
        lengthDisplay: formatMeasurementToEighth(totalLen),
        colorDisplay: trimPdfShopColor,
      });
      toast.success('Trim drawing saved as PDF', { id: 'trim-pdf' });
    } catch (e) {
      console.error(e);
      toast.error('Failed to save PDF', { id: 'trim-pdf' });
    }
  }

  async function downloadTrimDrawingPdfForSavedTrim(
    trimName: string,
    segments: LineSegment[]
  ) {
    if (segments.length === 0) {
      toast.error('This trim has no saved drawing to export.');
      return;
    }
    try {
      toast.loading('Creating PDF...', { id: 'trim-pdf' });
      const base = sanitizePdfFilenameBase(trimName);
      const totalLen = calculateTotalLengthFromSegments(segments);
      await exportTrimDrawingAsPdfFile(segments, {}, `${base}-Trim-Drawing.pdf`, {
        title: trimName,
        lengthDisplay: formatMeasurementToEighth(totalLen),
        colorDisplay: '',
      });
      toast.success('PDF downloaded', { id: 'trim-pdf' });
    } catch (e) {
      console.error(e);
      toast.error('Failed to create PDF', { id: 'trim-pdf' });
    }
  }

  function handleOpenCombineTrimPdfDialog() {
    const configsForTab =
      priceListTrimTab === 'standard'
        ? savedConfigs.filter((c) => !isSavedConfigCustom(c))
        : savedConfigs.filter((c) => isSavedConfigCustom(c));
    const selected = configsForTab.filter((c) => priceListPdfSelectedIds.has(c.id));
    const withDrawings = selected
      .map((c) => ({
        config: c,
        segments: parseDrawingSegmentsFromSavedConfig(c),
      }))
      .filter((x) => x.segments.length > 0);
    if (withDrawings.length === 0) {
      toast.error('Select at least one trim that has a saved drawing.');
      return;
    }
    setCombineTrimPdfDraft(
      withDrawings.map((x) => ({
        configId: x.config.id,
        name: x.config.name,
        segments: x.segments,
        qtyText: '1',
        lengthText: formatMeasurementToEighth(calculateTotalLengthFromSegments(x.segments)),
        colorText: '',
      }))
    );
    setShowCombineTrimPdfDialog(true);
  }

  async function handleDownloadCombinedTrimPdf() {
    if (combineTrimPdfDraft.length === 0) return;
    try {
      toast.loading('Creating PDF...', { id: 'trim-pdf' });
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF('p', 'pt', 'letter') as unknown as TrimPdfDoc;
      combineTrimPdfDraft.forEach((row, index) => {
        addTrimDrawingPageToPdf(doc, index === 0, {
          segments: row.segments,
          angleDisplayModeRecord: {},
          title: row.name,
          lengthDisplay: row.lengthText,
          colorDisplay: row.colorText,
          qtyDisplay: row.qtyText,
        });
      });
      doc.save(`Trim-Pack-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('Combined PDF downloaded', { id: 'trim-pdf' });
      setShowCombineTrimPdfDialog(false);
    } catch (e) {
      console.error(e);
      toast.error('Failed to create combined PDF', { id: 'trim-pdf' });
    }
  }

  function calculateTotalLength() {
    return calculateTotalLengthFromSegments(drawing.segments);
  }

  function applyDrawingToCalculator() {
    const totalLength = calculateTotalLength();
    
    if (totalLength === 0) {
      toast.error('No segments drawn');
      return;
    }
    
    // Count bends (number of segments - 1, plus any hems)
    const bends = Math.max(0, drawing.segments.length - 1) + 
                  drawing.segments.filter(s => s.hasHem).length;
    
    // Set the values
    const roundedTotalLength = roundToNearestEighth(totalLength);
    setInchInputs([{ id: '1', value: roundedTotalLength.toFixed(3) }]);
    setNumberOfBends(bends.toString());
    
    toast.success(`Applied: ${formatMeasurementToEighth(totalLength)} with ${bends} bends`);
    setShowDrawing(false);
  }

  // Load saved values from database on mount
  useEffect(() => {
    console.log('🚀 Trim Calculator mounted - loading data...');
    loadJobs();
    loadSavedConfigs();
    loadTrimTypes();
  }, []);
  
  // Update selected trim type when selection changes
  useEffect(() => {
    const selected = trimTypes.find(t => t.id === selectedTrimTypeId);
    setSelectedTrimType(selected || null);
  }, [selectedTrimTypeId, trimTypes]);



  async function loadJobs() {
    try {
      // Prefer active jobs, but fall back to broader/legacy schemas so the dialog never looks broken.
      let data: any[] | null = null;
      let error: any = null;
      ({ data, error } = await supabase
        .from('jobs')
        .select('id, name, job_number, status')
        .eq('status', 'active')
        .order('name'));

      if (error && /status|column|schema cache|could not find/i.test(String(error.message || ''))) {
        ({ data, error } = await supabase
          .from('jobs')
          .select('id, name, job_number')
          .order('name'));
      }
      if (!error && (!data || data.length === 0)) {
        // Some accounts don't use "active" status; show all jobs instead of empty list.
        ({ data, error } = await supabase
          .from('jobs')
          .select('id, name, job_number')
          .order('name'));
      }

      if (error) {
        if (isAbortLikeError(error)) return;
        console.error('Error loading jobs:', error);
        toast.error(`Failed to load jobs: ${error.message || 'Unknown error'}`);
        setJobs([]);
        return;
      }

      const normalized = (data || [])
        .filter((j: any) => !!j?.id && !!j?.name)
        .map((j: any) => ({
          id: String(j.id),
          name: String(j.name),
          job_number: j.job_number ?? null,
        }));
      setJobs(normalized);
    } catch (error: any) {
      if (isAbortLikeError(error)) return;
      console.error('Error loading jobs:', error);
      toast.error(`Failed to load jobs: ${error?.message || 'Unknown error'}`);
      setJobs([]);
    }
  }
  
  async function loadTrimTypes() {
    try {
      console.log('🔄 Loading trim types from database...');
      // Backward-compatible load: some deployments may not have active/cut_price yet.
      let data: any[] | null = null;
      let error: any = null;
      ({ data, error } = await supabase
        .from('trim_types')
        .select('id,name,width_inches,cost_per_lf,price_per_bend,markup_percent,cut_price,active')
        .order('name'));
      if (error && /active|cut_price|column|schema cache|could not find/i.test(String(error.message || ''))) {
        ({ data, error } = await supabase
          .from('trim_types')
          .select('id,name,width_inches,cost_per_lf,price_per_bend,markup_percent')
          .order('name'));
      }
      if (error) {
        if (isAbortLikeError(error)) return;
        console.error('❌ Error loading trim types:', error);
        toast.error(`Failed to load trim types: ${error.message || 'Unknown error'}`);
        return;
      }

      const normalized: TrimType[] = (data || [])
        .map((row: any) => ({
          id: row.id,
          name: row.name || 'Trim',
          width_inches: Number(row.width_inches) || 0,
          cost_per_lf: Number(row.cost_per_lf) || 0,
          price_per_bend: Number(row.price_per_bend) || 0,
          markup_percent: Number(row.markup_percent) || 0,
          cut_price: Number(row.cut_price) || 0,
          active: row.active !== false,
        }))
        .filter((row) => row.active)
        .sort((a, b) => a.name.localeCompare(b.name));

      console.log('✅ Loaded trim types:', normalized);
      console.log('📊 Total trim types found:', normalized.length || 0);
      setTrimTypes(normalized);
      
      // Auto-select first type if none selected
      if (normalized.length > 0 && !selectedTrimTypeId) {
        setSelectedTrimTypeId(normalized[0].id);
        console.log('✅ Auto-selected first trim type:', normalized[0].name);
      }
    } catch (error: any) {
      if (isAbortLikeError(error)) return;
      console.error('❌ Error loading trim types:', error);
      toast.error(`Failed to load trim types: ${error.message || 'Unknown error'}`);
    }
  }

  async function loadSavedConfigs(silent = false) {
    const gen = ++loadSavedConfigsGenRef.current;
    try {
      console.log('🔄 Loading saved trim configurations from database...');

      const { data, error } = await supabase
        .from('trim_saved_configs')
        .select('*')
        .order('created_at', { ascending: false });

      if (gen !== loadSavedConfigsGenRef.current) return;

      if (error) {
        if (isAbortLikeError(error)) return;
        console.error('❌ Error loading saved configs:', error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        if (!silent) {
          toast.error(`Failed to load saved configurations: ${error.message}`);
        }
        return;
      }

      console.log('✅ Loaded saved configs:', data?.length || 0);
      if (data && data.length > 0) {
        console.log('📋 All configs:', data);
        console.log('First config details:', {
          name: data[0].name,
          inches: data[0].inches,
          inchesType: typeof data[0].inches,
          bends: data[0].bends,
          material: data[0].material_type_name,
          createdAt: data[0].created_at
        });
      } else {
        console.warn('⚠️ No saved configurations found in database');
      }

      setSavedConfigs(data || []);
    } catch (error: any) {
      if (isAbortLikeError(error)) return;
      if (gen !== loadSavedConfigsGenRef.current) return;
      console.error('❌ Unexpected error loading saved configs:', error);
      if (!silent) {
        toast.error(`Error: ${error.message || 'Unknown error'}`);
      }
    }
  }

  function performTrimLibraryExport() {
    let list: SavedConfig[];
    if (exportTrimScope === 'standard') {
      list = savedConfigs.filter((c) => !isSavedConfigCustom(c));
    } else if (exportTrimScope === 'custom') {
      list = savedConfigs.filter((c) => isSavedConfigCustom(c));
    } else {
      list = [...savedConfigs];
    }
    if (list.length === 0) {
      toast.error('Nothing to export for this selection');
      return;
    }
    const sorted = [...list].sort((a, b) =>
      String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base' })
    );
    const trim_saved_configs = sorted.map(serializeSavedConfigForExport);
    const payload: Record<string, unknown> = {
      export_version: 1,
      exported_at: new Date().toISOString(),
      scope: exportTrimScope,
      trim_saved_configs,
    };
    if (exportIncludeTrimTypes) {
      payload.trim_types = trimTypes.map((t) => ({
        id: t.id,
        name: t.name,
        width_inches: t.width_inches,
        cost_per_lf: t.cost_per_lf,
        price_per_bend: t.price_per_bend,
        markup_percent: t.markup_percent,
        cut_price: t.cut_price,
        active: t.active,
      }));
    }
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadJsonFile(`trim-library-export-${dateStamp}-${exportTrimScope}.json`, payload);
    toast.success(`Downloaded ${list.length} trim configuration(s)`);
    setShowExportTrimsDialog(false);
  }

  
  async function saveTrimType() {
    if (!newTrimTypeName.trim()) {
      toast.error('Please enter a name for the trim type');
      return;
    }
    
    const width = parseFloat(newTrimTypeWidth);
    const cost = parseFloat(newTrimTypeCost);
    const bendPrice = parseFloat(newTrimTypeBendPrice);
    const markup = parseFloat(newTrimTypeMarkup);
    const cutPrice = parseFloat(newTrimTypeCutPrice);
    
    if (!width || width <= 0) {
      toast.error('Please enter a valid width');
      return;
    }
    
    if (!cost || cost <= 0) {
      toast.error('Please enter a valid cost per LF');
      return;
    }
    
    if (!bendPrice || bendPrice <= 0) {
      toast.error('Please enter a valid price per bend');
      return;
    }
    
    if (markup < 0) {
      toast.error('Please enter a valid markup percentage');
      return;
    }
    
    if (!cutPrice || cutPrice <= 0) {
      toast.error('Please enter a valid cut price');
      return;
    }
    
    try {
      if (editingTrimType) {
        // Update existing
        const updatePayload: Record<string, unknown> = {
          name: newTrimTypeName.trim(),
          width_inches: width,
          cost_per_lf: cost,
          price_per_bend: bendPrice,
          markup_percent: markup,
          cut_price: cutPrice,
          updated_at: new Date().toISOString()
        };
        let { error } = await supabase
          .from('trim_types')
          .update(updatePayload)
          .eq('id', editingTrimType.id);
        if (error && /cut_price|updated_at|column|schema cache|could not find/i.test(String(error.message || ''))) {
          const { cut_price: _dropCut, updated_at: _dropUpdated, ...legacyPayload } = updatePayload as any;
          ({ error } = await supabase
            .from('trim_types')
            .update(legacyPayload)
            .eq('id', editingTrimType.id));
        }
        
        if (error) throw error;
        toast.success('Material type updated');
      } else {
        // Insert new
        const insertPayload: Record<string, unknown> = {
          name: newTrimTypeName.trim(),
          width_inches: width,
          cost_per_lf: cost,
          price_per_bend: bendPrice,
          markup_percent: markup,
          cut_price: cutPrice,
          active: true
        };
        let { data, error } = await supabase
          .from('trim_types')
          .insert([insertPayload])
          .select()
          .single();
        if (error && /cut_price|active|column|schema cache|could not find/i.test(String(error.message || ''))) {
          const { cut_price: _dropCut, active: _dropActive, ...legacyPayload } = insertPayload as any;
          ({ data, error } = await supabase
            .from('trim_types')
            .insert([legacyPayload])
            .select()
            .single());
        }
        
        if (error) throw error;
        
        // Auto-select the newly created material type
        if (data) {
          setSelectedTrimTypeId(data.id);
        }
        
        toast.success('Material type added and selected');
      }
      
      // Reload trim types
      await loadTrimTypes();
      
      // Reset form
      setNewTrimTypeName('');
      setNewTrimTypeWidth('42');
      setNewTrimTypeCost('3.46');
      setNewTrimTypeBendPrice('1.00');
      setNewTrimTypeMarkup('35');
      setNewTrimTypeCutPrice('1.00');
      setEditingTrimType(null);
    } catch (error) {
      console.error('Error saving trim type:', error);
      toast.error(`Failed to save material type: ${(error as any)?.message || 'Unknown error'}`);
    }
  }
  
  async function deleteTrimType(id: string) {
    if (!confirm('Delete this trim type?')) return;
    
    try {
      let { error } = await supabase
        .from('trim_types')
        .update({ active: false })
        .eq('id', id);
      if (error && /active|column|schema cache|could not find/i.test(String(error.message || ''))) {
        // Older schema without active flag: hard-delete row as fallback.
        ({ error } = await supabase
          .from('trim_types')
          .delete()
          .eq('id', id));
      }
      
      if (error) throw error;
      
      toast.success('Trim type deleted');
      await loadTrimTypes();
      
      // If deleted type was selected, clear selection
      if (selectedTrimTypeId === id) {
        setSelectedTrimTypeId('');
      }
    } catch (error) {
      console.error('Error deleting trim type:', error);
      toast.error('Failed to delete trim type');
    }
  }
  
  function startEditTrimType(trimType: TrimType) {
    setEditingTrimType(trimType);
    setNewTrimTypeName(trimType.name);
    setNewTrimTypeWidth(trimType.width_inches.toString());
    setNewTrimTypeCost(trimType.cost_per_lf.toString());
    setNewTrimTypeBendPrice(trimType.price_per_bend.toString());
    setNewTrimTypeMarkup(trimType.markup_percent.toString());
    setNewTrimTypeCutPrice(trimType.cut_price.toString());
  }
  
  function cancelEditTrimType() {
    setEditingTrimType(null);
    setNewTrimTypeName('');
    setNewTrimTypeWidth('42');
    setNewTrimTypeCost('3.46');
    setNewTrimTypeBendPrice('1.00');
    setNewTrimTypeMarkup('35');
    setNewTrimTypeCutPrice('1.00');
  }

  // Auto-update calculator from drawing in real-time
  useEffect(() => {
    if (drawing.segments.length > 0) {
      const totalLength = calculateTotalLength();
      const bends = Math.max(0, drawing.segments.length - 1) + 
                    drawing.segments.filter(s => s.hasHem).length;
      
      // Update calculator inputs automatically
      setInchInputs([{ id: '1', value: totalLength.toFixed(2) }]);
      setNumberOfBends(bends.toString());
    }
  }, [drawing.segments]);

  // Load / price-list dialogs: always open on Standard (library) list first
  useEffect(() => {
    if (showLoadDialog) {
      setLoadSavedTrimTab('standard');
      setLoadConfigSearch('');
    }
  }, [showLoadDialog]);
  useEffect(() => {
    if (showPriceList) setPriceListTrimTab('standard');
  }, [showPriceList]);

  // Calculate trim pricing
  useEffect(() => {
    // All values come from selected trim type
    if (!selectedTrimType) {
      // No material selected - show zeros
      setCostPerInch(0);
      setCostPerBend(0);
      setTotalBendCost(0);
      setTotalInchCost(0);
      setTotalCutCost(0);
      setSellingPrice(0);
      setMaterialCost(0);
      setMarkupAmount(0);
      return;
    }
    
    const lfCost = selectedTrimType.cost_per_lf;
    const sheetWidth = selectedTrimType.width_inches;
    const bendPriceVal = selectedTrimType.price_per_bend;
    const markup = selectedTrimType.markup_percent;
    const cutPriceVal = selectedTrimType.cut_price;
    const bends = parseInt(numberOfBends) || 0;

    // Sum all inch inputs
    const totalIn = inchInputs.reduce((sum, input) => {
      const val = parseFloat(input.value) || 0;
      return sum + val;
    }, 0);
    setTotalInches(totalIn);

    // If no settings configured, show 0s
    if (!lfCost || lfCost <= 0 || !bendPriceVal || bendPriceVal <= 0 || markup < 0) {
      setCostPerInch(0);
      setCostPerBend(0);
      setTotalBendCost(0);
      setTotalInchCost(0);
      setTotalCutCost(0);
      setSellingPrice(0);
      setMaterialCost(0);
      setMarkupAmount(0);
      return;
    }

    // CALCULATION:
    // 1. LF cost is for a sheet of specific width that is 10' long
    // 2. Multiply by 10 to get cost for the full 10' sheet
    const sheetCost = lfCost * 10;
    
    // 3. Calculate cost per inch BEFORE markup (material cost)
    // Divide by the sheet's width in inches
    const costPerInchBeforeMarkup = sheetCost / sheetWidth;
    
    // 4. Material cost for this piece (before markup)
    const materialCostValue = totalIn * costPerInchBeforeMarkup;
    setMaterialCost(materialCostValue);
    
    // 5. Apply markup percentage
    const markupMultiplier = 1 + (markup / 100);
    const markedUpSheetCost = sheetCost * markupMultiplier;
    
    // 6. Divide by sheet width to get price per inch for a 10' strip (after markup)
    const pricePerInch = markedUpSheetCost / sheetWidth;
    setCostPerInch(pricePerInch);
    
    // 7. Calculate markup amount added
    const markupAmountValue = (totalIn * pricePerInch) - materialCostValue;
    setMarkupAmount(markupAmountValue);
    
    // Cost per bend
    setCostPerBend(bendPriceVal);
    
    // Total bend cost = bends × price per bend
    const bendCost = bends * bendPriceVal;
    setTotalBendCost(bendCost);
    
    // Total inch cost = total inches × price per inch (with markup)
    const inchCost = totalIn * pricePerInch;
    setTotalInchCost(inchCost);
    
    // Cut cost (always 1 cut)
    const cutCost = cutPriceVal || 0;
    setTotalCutCost(cutCost);
    
    // Selling price = (total inches × price per inch) + (bends × bend price) + cut cost
    setSellingPrice(inchCost + bendCost + cutCost);
  }, [inchInputs, numberOfBends, selectedTrimType]);

  function addInchInput() {
    const newId = (Math.max(...inchInputs.map(i => parseInt(i.id)), 0) + 1).toString();
    setInchInputs([...inchInputs, { id: newId, value: '' }]);
  }

  function removeInchInput(id: string) {
    if (inchInputs.length === 1) {
      toast.error('At least one inch input is required');
      return;
    }
    setInchInputs(inchInputs.filter(input => input.id !== id));
  }

  function updateInchInput(id: string, value: string) {
    setInchInputs(inchInputs.map(input => 
      input.id === id ? { ...input, value } : input
    ));
  }

  function clearCalculation() {
    setInchInputs([{ id: '1', value: '' }]);
    setNumberOfBends('');
  }

  async function saveConfiguration() {
    if (!configName.trim()) {
      toast.error('Please enter a name for this configuration');
      return;
    }

    const inches = inchInputs.map(i => parseFloat(i.value) || 0).filter(v => v > 0);
    const bends = parseInt(numberOfBends) || 0;

    if (inches.length === 0) {
      toast.error('Please enter at least one inch measurement');
      return;
    }

    if (!selectedTrimType) {
      toast.error('Please select a material type first');
      return;
    }

    try {
      setSaving(true);
      
      const jobName = selectedJobId 
        ? jobs.find(j => j.id === selectedJobId)?.name || null
        : null;



      const configData = {
        name: configName.trim(),
        job_id: selectedJobId || null,
        job_name: jobName,
        inches: inches, // Store as array directly - Postgres JSONB will handle it
        bends,
        drawing_segments: drawing.segments.length > 0 ? drawing.segments : null, // Store as array
        material_type_id: selectedTrimTypeId,
        material_type_name: selectedTrimType.name,
        is_custom_trim: saveAsCustomTrim,
      };

      console.log('💾 Saving config data:', configData);
      console.log('📍 Current user session:', await supabase.auth.getSession());
      
      let insertedData: any[] | null = null;
      let insertRes = await supabase.from('trim_saved_configs').insert([configData]).select();
      if (insertRes.error && /is_custom_trim|column/i.test(String(insertRes.error.message || ''))) {
        const { is_custom_trim: _drop, ...withoutCustomFlag } = configData as Record<string, unknown>;
        insertRes = await supabase.from('trim_saved_configs').insert([withoutCustomFlag]).select();
        if (!insertRes.error) {
          toast.info('Saved without trim category column — run the latest Supabase migration for Standard vs Custom lists.');
        }
      }
      insertedData = insertRes.data;
      if (insertRes.error) {
        console.error('❌ Insert error:', insertRes.error);
        console.error('Error details:', {
          message: insertRes.error.message,
          code: insertRes.error.code,
          details: insertRes.error.details,
          hint: insertRes.error.hint
        });
        throw insertRes.error;
      }
      
      console.log('✅ Successfully inserted config:', insertedData);
      console.log('📊 Total configs now:', (savedConfigs.length + 1));

      const newConfigId = insertedData?.[0]?.id;
      if (addToJobWorkbook && selectedJobId && newConfigId) {
        try {
          const { data: wb } = await supabase
            .from('material_workbooks')
            .select('id')
            .eq('job_id', selectedJobId)
            .eq('status', 'working')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (wb) {
            const { data: sheets } = await supabase
              .from('material_sheets')
              .select('id')
              .eq('workbook_id', wb.id)
              .order('order_index')
              .limit(1);
            const sheetId = sheets?.[0]?.id;
            if (sheetId) {
              const { data: maxOrder } = await supabase
                .from('material_items')
                .select('order_index')
                .eq('sheet_id', sheetId)
                .eq('category', 'Trim')
                .order('order_index', { ascending: false })
                .limit(1)
                .maybeSingle();
              const nextOrderIndex = (maxOrder?.order_index ?? -1) + 1;
              const qty = Math.max(1, Math.floor(parseFloat(String(workbookAddQty)) || 1));
              const costPerUnit = Math.round(materialCost * 10000) / 10000;
              const pricePerUnit = Math.round(sellingPrice * 10000) / 10000;
              const insertPayload: Record<string, unknown> = {
                sheet_id: sheetId,
                category: 'Trim',
                sku: 'CW-CBT10',
                material_name: configName.trim() || insertedData[0].name,
                quantity: qty,
                color: (workbookAddColor && String(workbookAddColor).trim()) || null,
                cost_per_unit: costPerUnit,
                price_per_unit: pricePerUnit,
                extended_cost: Math.round(costPerUnit * qty * 10000) / 10000,
                extended_price: Math.round(pricePerUnit * qty * 10000) / 10000,
                markup_percent: materialCost > 0 ? (sellingPrice - materialCost) / materialCost : null,
                order_index: nextOrderIndex,
                status: 'not_ordered',
                taxable: true,
              };
              const { data: insertedRows, error: itemErr } = await supabase.from('material_items').insert(insertPayload as any).select('id');
              if (itemErr) throw itemErr;
              const newItemId = insertedRows?.[0]?.id;
              if (newItemId) {
                const { error: linkErr } = await supabase.rpc('set_material_item_trim_config', {
                  p_material_item_id: newItemId,
                  p_trim_saved_config_id: newConfigId,
                });
                if (linkErr) console.warn('Trim link after insert:', linkErr);
              }
              toast.success('Configuration saved and added to job workbook. Shop will see the drawing in the pull form.');
            } else {
              toast.success('Configuration saved. No sheet in workbook — add the trim line from the job materials if needed.');
            }
          } else {
            toast.success('Configuration saved. Job has no working workbook — add the trim line from the job materials if needed.');
          }
        } catch (addErr: any) {
          console.warn('Add to workbook failed:', addErr);
          toast.warning(`Saved trim config, but adding to workbook failed: ${addErr?.message || 'unknown'}. You can link it later from the job materials.`);
        }
      } else {
        toast.success('Configuration saved successfully');
      }

      if (linkToMaterialItemId && newConfigId) {
        try {
          const { error: linkErr } = await supabase.rpc('set_material_item_trim_config', {
            p_material_item_id: linkToMaterialItemId,
            p_trim_saved_config_id: newConfigId,
          });
          if (linkErr) throw linkErr;
          toast.success('Trim saved and linked to the material item. Shop will see the drawing in the pull form.');
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('linkToMaterialItem');
            return next;
          }, { replace: true });
        } catch (linkErr: any) {
          console.warn('Link to material item failed:', linkErr);
          toast.warning(`Trim saved, but linking to material item failed: ${linkErr?.message || 'unknown'}. You can link it from the workbook.`);
        }
      }
      
      setShowSaveDialog(false);
      setConfigName('');
      setSelectedJobId('');
      setAddToJobWorkbook(false);
      setWorkbookAddQty('1');
      setWorkbookAddColor('');
      // Reload configs to show the new one
      setTimeout(() => loadSavedConfigs(), 500);
    } catch (error: any) {
      console.error('Error saving configuration:', error);
      toast.error(`Failed to save configuration: ${error.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  function loadConfiguration(config: SavedConfig) {
    // Parse inches from database (stored as JSON) - with error handling
    let inchesArray: number[];
    try {
      if (typeof config.inches === 'string') {
        inchesArray = JSON.parse(config.inches);
      } else if (Array.isArray(config.inches)) {
        inchesArray = config.inches;
      } else {
        console.error('Invalid inches data in config:', config.inches);
        toast.error('Failed to load configuration - invalid data format');
        return;
      }
      
      // Ensure it's an array
      if (!Array.isArray(inchesArray)) {
        console.error('Inches is not an array:', inchesArray);
        toast.error('Failed to load configuration - data format error');
        return;
      }
    } catch (error) {
      console.error('Error parsing inches:', error);
      toast.error('Failed to load configuration - parse error');
      return;
    }
    
    const newInputs = inchesArray.map((value: number, index: number) => ({
      id: (index + 1).toString(),
      value: value.toString(),
    }));
    setInchInputs(newInputs);
    
    // Load bends
    setNumberOfBends(config.bends.toString());
    
    // Load material type if available
    if (config.material_type_id && trimTypes.some(t => t.id === config.material_type_id)) {
      setSelectedTrimTypeId(config.material_type_id);
    }
    
    const drawingSegments = parseDrawingSegmentsFromSavedConfig(config);

    if (drawingSegments.length > 0) {
      setShowDrawing(true); // Ensure drawing panel is visible when loading a trim that has a drawing
      setDrawing({
        segments: drawingSegments,
        selectedSegmentId: null,
        currentPoint: null,
        nextLabel: 65 + drawingSegments.length
      });
      toast.success(`Loaded configuration with drawing: ${config.name}`);
    } else {
      setDrawing(prev => ({ ...prev, segments: [], selectedSegmentId: null, currentPoint: null, nextLabel: 65 }));
      toast.success(`Loaded configuration: ${config.name}`);
    }

    setShowLoadDialog(false);
    setPreviewConfig(null);
  }
  
  function showConfigPreview(config: SavedConfig) {
    setPreviewConfig(config);
  }
  
  function calculateConfigPricing(config: SavedConfig) {
    if (!selectedTrimType) {
      return { cost: 0, price: 0, markup: 0, markupPercent: 0 };
    }
    
    const lfCost = selectedTrimType.cost_per_lf;
    const sheetWidth = selectedTrimType.width_inches;
    const bendPriceVal = selectedTrimType.price_per_bend;
    const markup = selectedTrimType.markup_percent;
    const cutPriceVal = selectedTrimType.cut_price;
    
    if (!lfCost || !bendPriceVal || markup < 0 || !cutPriceVal) {
      return { cost: 0, price: 0, markup: 0, markupPercent: 0 };
    }
    
    // Parse inches from database (stored as JSON) - with error handling
    let inchesArray: number[];
    try {
      if (typeof config.inches === 'string') {
        inchesArray = JSON.parse(config.inches);
      } else if (Array.isArray(config.inches)) {
        inchesArray = config.inches;
      } else {
        console.error('Invalid inches data:', config.inches);
        return { cost: 0, price: 0, markup: 0, markupPercent: 0 };
      }
      
      // Ensure it's an array
      if (!Array.isArray(inchesArray)) {
        console.error('Inches is not an array:', inchesArray);
        return { cost: 0, price: 0, markup: 0, markupPercent: 0 };
      }
    } catch (error) {
      console.error('Error parsing inches:', error, config.inches);
      return { cost: 0, price: 0, markup: 0, markupPercent: 0 };
    }
    
    const totalInches = inchesArray.reduce((sum: number, val: number) => sum + val, 0);
    
    // Material cost calculation
    const sheetCost = lfCost * 10;
    const costPerInchBeforeMarkup = sheetCost / sheetWidth;
    const materialCost = totalInches * costPerInchBeforeMarkup;
    
    // Apply markup
    const markupMultiplier = 1 + (markup / 100);
    const markedUpSheetCost = sheetCost * markupMultiplier;
    const pricePerInch = markedUpSheetCost / sheetWidth;
    
    const totalInchCost = totalInches * pricePerInch;
    const totalBendCost = config.bends * bendPriceVal;
    const totalCutCost = cutPriceVal;
    
    const sellingPrice = totalInchCost + totalBendCost + totalCutCost;
    const totalCost = materialCost + totalBendCost + totalCutCost;
    const markupAmount = sellingPrice - totalCost;
    const markupPercentActual = totalCost > 0 ? (markupAmount / totalCost) * 100 : 0;
    
    return {
      cost: totalCost,
      price: sellingPrice,
      markup: markupAmount,
      markupPercent: markupPercentActual
    };
  }

  /** Move saved trim between Standard (library) and Custom lists by setting is_custom_trim. */
  async function setSavedConfigClassification(configId: string, asCustom: boolean) {
    const id = typeof configId === 'string' ? configId.trim() : String(configId);
    if (!id) {
      toast.error('Invalid configuration');
      return;
    }
    setReclassifyingConfigId(id);
    try {
      const { error } = await supabase
        .from('trim_saved_configs')
        .update({ is_custom_trim: asCustom })
        .eq('id', id);

      if (error) {
        if (/is_custom_trim|column/i.test(String(error.message || ''))) {
          toast.error('Database missing is_custom_trim — run migration 20250326000000_trim_saved_configs_is_custom.sql.');
          return;
        }
        throw error;
      }

      setSavedConfigs((prev) =>
        prev.map((c) => (String(c.id) === id ? { ...c, is_custom_trim: asCustom } : c))
      );
      toast.success(asCustom ? 'Moved to Custom trims' : 'Moved to Standard trims');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not update classification';
      toast.error(msg);
    } finally {
      setReclassifyingConfigId(null);
    }
  }

  async function deleteConfiguration(configId: string) {
    const id = typeof configId === 'string' ? configId.trim() : String(configId);
    if (!id) {
      toast.error('Cannot delete: invalid configuration');
      return;
    }
    if (!confirm('Delete this saved configuration? It will be removed from the list.')) return;

    setDeletingConfigId(id);
    // Remove from list immediately so the item disappears and stays removed
    setSavedConfigs((prev) => prev.filter((c) => String(c.id) !== id));

    try {
      // Edge Function uses service role — can always delete even when table permissions block the client
      const { data: fnData, error: fnError } = await supabase.functions.invoke('delete-trim-config', {
        body: { config_id: id },
      });

      const success =
        !fnError &&
        (fnData?.deleted_id != null || fnData?.error === 'Not found or already deleted');

      if (success) {
        toast.success('Configuration deleted');
        setDeletingConfigId(null);
        return;
      }

      // Function not deployed or failed — show how to fix
      const notDeployed =
        fnError?.message?.includes('404') ||
        fnError?.message?.toLowerCase().includes('function') ||
        fnError?.message?.toLowerCase().includes('not found');
      if (notDeployed) {
        toast.error(
          'Deploy the delete function once: supabase functions deploy delete-trim-config',
          { duration: 10000 }
        );
        console.error(
          'Run in terminal (from project root): supabase functions deploy delete-trim-config'
        );
      } else {
        toast.error(fnError?.message || fnData?.error || 'Delete failed');
      }
      await loadSavedConfigs(true); // Restore list when delete failed
    } finally {
      setDeletingConfigId(null);
    }
  }

  const hasSettings = selectedTrimType !== null;

  return (
    <>
    <div className="grid grid-cols-[2.2fr,0.8fr] gap-3 max-w-full mx-auto h-[calc(100vh-80px)] overflow-hidden p-2">
      {/* Drawing Tool - Left Side */}
      <Card className="border-4 border-yellow-500 bg-gradient-to-br from-green-950 via-black to-green-900 shadow-2xl flex flex-col h-full overflow-hidden">
        <CardHeader className="pb-2 border-b-2 border-yellow-500 py-2">
          <CardTitle className="flex items-center gap-2 text-yellow-500">
            <Pencil className="w-5 h-5" />
            <span className="text-lg font-bold">2D Drawing Tool</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 flex-1 flex flex-col overflow-hidden">
          <div ref={canvasContainerRef} className="relative border-4 border-gray-300 rounded overflow-hidden shadow-2xl bg-white h-full">
            {!canvasReady ? (
              <div className="w-full h-full flex items-center justify-center bg-gray-100">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-gray-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-700 font-semibold">Loading Canvas...</p>
                </div>
              </div>
            ) : (
              <div ref={canvasScrollContainerRef} className="overflow-auto h-full w-full min-h-0">
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  onClick={handleCanvasClick}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseLeave={() => setCrosshairScreenPos(null)}
                  className={crosshairScreenPos !== null ? '' : 'cursor-crosshair'}
                  style={{ display: 'block', cursor: crosshairScreenPos !== null ? 'none' : 'crosshair' }}
                />
                {/* Custom crosshair drawn in DOM so it stays on top of canvas (fixes cursor hidden on laptops) */}
                {crosshairScreenPos && (
                  <div
                    aria-hidden
                    className="pointer-events-none fixed z-[999999]"
                    style={{
                      left: crosshairScreenPos.x,
                      top: crosshairScreenPos.y,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-800 drop-shadow-sm">
                      <line x1="12" y1="2" x2="12" y2="8" />
                      <line x1="12" y1="16" x2="12" y2="22" />
                      <line x1="2" y1="12" x2="8" y2="12" />
                      <line x1="16" y1="12" x2="22" y2="12" />
                      <circle cx="12" cy="12" r="2" fill="currentColor" />
                    </svg>
                  </div>
                )}
              </div>
            )}
            
            {/* Top Controls - Overlaid on Canvas */}
            <div className="absolute top-2 left-2 right-2 flex flex-wrap items-center gap-2 bg-white p-2 rounded-lg border-2 border-gray-300 shadow-lg text-xs">
              {/* Draw/Stop Drawing Button */}
              {!isDrawingMode ? (
                <Button
                  onClick={() => {
                    setIsDrawingMode(true);
                    setDrawingLocked(false);
                  }}
                  size="sm"
                  className="h-7 px-4 font-bold text-xs bg-green-600 hover:bg-green-700 text-white"
                >
                  Draw
                </Button>
              ) : (
                <>
                  <Button
                    onClick={stopDrawing}
                    size="sm"
                    className="h-7 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-bold"
                  >
                    {drawing.currentPoint ? 'Cancel Line' : 'Stop Drawing'}
                  </Button>
                </>
              )}              
              
              <Button
                onClick={undoDrawing}
                size="sm"
                variant="outline"
                disabled={drawingHistory.length === 0}
                className="h-7 px-2 border border-slate-400 text-slate-700 hover:bg-slate-50 disabled:opacity-50 text-xs"
                title="Undo last change"
              >
                <Undo2 className="w-3 h-3 mr-1" />
                Undo
              </Button>
              <Button
                onClick={clearDrawing}
                size="sm"
                variant="outline"
                className="h-7 px-2 border border-red-500 text-red-600 hover:bg-red-50 text-xs"
              >
                <Trash className="w-3 h-3 mr-1" />
                Clear
              </Button>
              
              {drawing.segments.length > 0 && (
                <>
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 border border-gray-300 rounded">
                    <span className="text-gray-600 text-xs whitespace-nowrap">PDF total length:</span>
                    <span className="text-xs font-medium tabular-nums text-gray-900">
                      {formatMeasurementToEighth(calculateTotalLengthFromSegments(drawing.segments))}&quot;
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="trim-pdf-shop-color" className="text-gray-600 text-xs whitespace-nowrap shrink-0">
                      PDF color:
                    </Label>
                    <Input
                      id="trim-pdf-shop-color"
                      className="h-7 w-32 text-xs py-1 px-2"
                      placeholder="e.g. Charcoal"
                      value={trimPdfShopColor}
                      onChange={(e) => setTrimPdfShopColor(e.target.value)}
                    />
                  </div>
                </>
              )}
              <Button
                onClick={handleSaveTrimDrawingPDF}
                size="sm"
                variant="outline"
                className="h-7 px-2 border border-blue-600 text-blue-600 hover:bg-blue-50 text-xs"
                title="Save drawing as PDF (includes length & color above when set)"
              >
                <Download className="w-3 h-3 mr-1" />
                Save as PDF
              </Button>
              
              {/* Zoom: Ctrl+scroll on canvas */}
              <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-gray-700" title="Ctrl + scroll on canvas to zoom">
                <span className="text-xs whitespace-nowrap">Zoom:</span>
                <span className="text-xs font-medium tabular-nums">{Math.round((scale / 80) * 100)}%</span>
              </div>
              
              {/* Hem length (default 1/2") - visible when drawing has segments or in hem preview */}
              {(drawing.segments.length > 0 || hemPreviewMode) && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 border border-gray-300 rounded">
                  <label className="text-gray-700 text-xs whitespace-nowrap">Hem (in):</label>
                  <input
                    type="number"
                    min={0.125}
                    step={0.125}
                    value={(() => {
                      const selected = drawing.selectedSegmentId
                        ? drawing.segments.find((s) => s.id === drawing.selectedSegmentId)
                        : null;
                      if (selected?.hasHem) return getHemDepthForSegment(selected);
                      return hemDepthInches;
                    })()}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (Number.isNaN(v) || v < 0.125) return;
                      const selected = drawing.selectedSegmentId
                        ? drawing.segments.find((s) => s.id === drawing.selectedSegmentId)
                        : null;
                      if (selected?.hasHem) {
                        setDrawing((prev) => ({
                          ...prev,
                          segments: prev.segments.map((seg) =>
                            seg.id === selected.id ? { ...seg, hemDepthInches: v } : seg
                          ),
                        }));
                        return;
                      }
                      setHemDepthInches(v);
                    }}
                    className="w-16 h-6 text-xs border border-gray-400 rounded px-1 text-center"
                    title="Selected hem depth, or default depth for new hems"
                  />
                </div>
              )}
              {/* Add Hem Button - Available when segment selected or last segment exists */}
              {!hemPreviewMode && (drawing.selectedSegmentId || drawing.segments.length > 0) && (
                <Button
                  onClick={() => startHemPreview()}
                  size="sm"
                  className={`h-7 px-2 text-xs font-bold ${
                    (drawing.selectedSegmentId && drawing.segments.find(s => s.id === drawing.selectedSegmentId)?.hasHem) ||
                    (!drawing.selectedSegmentId && drawing.segments[drawing.segments.length - 1]?.hasHem)
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-purple-600 hover:bg-purple-700 text-white'
                  }`}
                >
                  {((drawing.selectedSegmentId && drawing.segments.find(s => s.id === drawing.selectedSegmentId)?.hasHem) ||
                    (!drawing.selectedSegmentId && drawing.segments[drawing.segments.length - 1]?.hasHem))
                    ? '- Remove Hem'
                    : '+ Add Hem'}
                </Button>
              )}
              
              {/* Hem Preview Choice Buttons */}
              {hemPreviewMode && (() => {
                const segment = drawing.segments.find(s => s.id === hemPreviewMode.segmentId);
                const endOpen = segment ? isSegmentEndOpen(segment.id, false) : false;
                const startOpen = segment ? isSegmentEndOpen(segment.id, true) : false;
                const endAllowed = segment ? canPlaceHemAtEnd(segment.id, false) : false;
                const startAllowed = segment ? canPlaceHemAtEnd(segment.id, true) : false;
                const cornerMode = Math.abs(Math.max(0.125, hemDepthInches) - 0.5) > 1e-6;
                return (
                <>
                  <div className="flex items-center gap-2 px-2 py-1 bg-purple-100 border-2 border-purple-500 rounded">
                    <span className="text-purple-700 font-bold text-xs">
                      U Hem ({hemDepthInches === 0.5 ? '1/2"' : `${hemDepthInches}"`}) — {cornerMode ? 'choose end (corner allowed), then side:' : 'open end only, then side:'}
                    </span>
                  </div>
                  {endAllowed && (
                  <Button
                    onClick={() => setHemPreviewEnd(false)}
                    size="sm"
                    variant="outline"
                    className={`h-7 px-2 text-xs ${!hemPreviewMode.hemAtStart ? 'border-purple-600 bg-purple-100 text-purple-800 font-bold' : 'border-gray-400 text-gray-600 hover:bg-gray-100'}`}
                  >
                    At end{!endOpen && cornerMode ? ' (corner)' : ''}
                  </Button>
                  )}
                  {startAllowed && (
                  <Button
                    onClick={() => setHemPreviewEnd(true)}
                    size="sm"
                    variant="outline"
                    className={`h-7 px-2 text-xs ${hemPreviewMode.hemAtStart ? 'border-purple-600 bg-purple-100 text-purple-800 font-bold' : 'border-gray-400 text-gray-600 hover:bg-gray-100'}`}
                  >
                    At start{!startOpen && cornerMode ? ' (corner)' : ''}
                  </Button>
                  )}
                  <Button
                    onClick={() => addHemToSide('left')}
                    size="sm"
                    className="h-7 px-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs"
                  >
                    ← LEFT
                  </Button>
                  <Button
                    onClick={() => addHemToSide('right')}
                    size="sm"
                    className="h-7 px-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs"
                  >
                    RIGHT →
                  </Button>
                  <Button
                    onClick={cancelHemPreview}
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 border border-gray-400 text-gray-600 hover:bg-gray-100 text-xs"
                  >
                    Cancel
                  </Button>
                </>
                );
              })()}
              
              {/* Zoom Controls */}
              <div className="flex gap-1 bg-gray-100 px-2 py-1 rounded border border-gray-300 ml-auto">
                <Button onClick={zoomOut} size="sm" variant="outline" className="h-6 w-6 p-0">
                  <span className="text-sm font-bold">-</span>
                </Button>
                <Button onClick={resetZoom} size="sm" variant="outline" className="h-6 px-2 text-xs">
                  {Math.round((scale / 80) * 100)}%
                </Button>
                <Button onClick={zoomIn} size="sm" variant="outline" className="h-6 w-6 p-0">
                  <span className="text-sm font-bold">+</span>
                </Button>
              </div>
            </div>

            {/* Segment Selection List - Bottom Left */}
            {drawing.segments.length > 0 && (
              <div className="absolute bottom-2 left-2 bg-white border-2 border-gray-300 rounded-lg p-2 shadow-lg max-w-xs">
                <p className="text-gray-800 font-bold mb-1 text-xs">Segments:</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {drawing.segments.map(seg => (
                    <div
                      key={seg.id}
                      onClick={() => selectSegment(seg.id)}
                      className={`px-2 py-1 rounded cursor-pointer text-xs font-medium transition-colors ${
                        seg.id === drawing.selectedSegmentId
                          ? 'bg-yellow-400 text-black'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>
                          {seg.label}{' '}
                          {seg.hasHem && `(HEM-${seg.hemSide?.toUpperCase()} ${cleanNumber(getHemDepthForSegment(seg))})`}
                        </span>
                        {seg.id === drawing.selectedSegmentId && (
                          <div className="flex gap-1">
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditMode(seg.id);
                              }}
                              size="sm"
                              variant="ghost"
                              className="h-5 w-5 p-0 text-blue-600 hover:bg-blue-100"
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSelectedSegment();
                              }}
                              size="sm"
                              variant="ghost"
                              className="h-5 w-5 p-0 text-red-600 hover:bg-red-100"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Edit segment — length and angle (shown when pencil is clicked) */}
            {editMode && (
              <div className="absolute bottom-40 left-2 right-auto bg-white border-2 border-blue-500 rounded-lg p-3 shadow-lg max-w-xs z-10">
                <p className="text-gray-800 font-bold text-xs mb-2">
                  Edit segment {drawing.segments.find(s => s.id === editMode.segmentId)?.label ?? ''}
                </p>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs text-gray-600">Length (in.)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.125"
                      value={editMode.measurement}
                      onChange={(e) => setEditMode(prev => prev ? { ...prev, measurement: e.target.value } : null)}
                      onKeyDown={(e) => { if (e.key === 'Enter') applyEdit(); if (e.key === 'Escape') setEditMode(null); }}
                      className="h-8 text-sm mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600">Angle (°)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="360"
                      step="1"
                      value={editMode.angle}
                      onChange={(e) => setEditMode(prev => prev ? { ...prev, angle: e.target.value } : null)}
                      onKeyDown={(e) => { if (e.key === 'Enter') applyEdit(); if (e.key === 'Escape') setEditMode(null); }}
                      className="h-8 text-sm mt-0.5"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                    onClick={applyEdit}
                  >
                    Apply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => setEditMode(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Live Drawing Info - Bottom Right (Minimal Black & White) - Only when actively drawing */}
            {isDrawingMode && drawing.currentPoint && mousePos && (
              <div className="absolute bottom-14 right-2 bg-white border border-gray-300 rounded p-2 shadow-md">
                <div className="space-y-1">
                  {(() => {
                    const dx = mousePos.x - drawing.currentPoint.x;
                    const dy = mousePos.y - drawing.currentPoint.y;
                    const length = Math.sqrt(dx * dx + dy * dy);
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    const displayAngle = angle < 0 ? angle + 360 : angle;
                    
                    return (
                      <>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-600">∠{Math.round(displayAngle)}°</span>
                          <span className="text-gray-800 font-semibold">{formatMeasurementToEighth(length)}</span>
                        </div>
                        <Input
                          ref={lengthInputRef}
                          type="number"
                          min="0"
                          step="0.125"
                          value={lengthInput}
                          onChange={(e) => setLengthInput(e.target.value)}
                          onKeyDown={handleLengthInput}
                          placeholder="Length"
                          className="h-6 text-xs bg-white border border-gray-300 focus:border-gray-500 text-center w-20"
                        />
                      </>
                    );
                  })()}
                </div>
              </div>
            )}


          </div>
          
          {/* Real-time Status */}
          {drawing.segments.length > 0 && (
            <div className="mt-1 bg-green-900/40 border-2 border-green-600 rounded-lg p-1 text-center">
              <div className="text-green-400 text-xs font-bold">✓ Auto-synced</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calculator - Right Side */}
      <Card className="border-4 border-yellow-500 bg-gradient-to-br from-green-950 via-black to-green-900 shadow-2xl flex flex-col h-full overflow-hidden">
        <CardHeader className="pb-2 border-b-2 border-yellow-500 py-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-yellow-500">
              <Calculator className="w-5 h-5" />
              <span className="text-lg font-bold">Calculator</span>
            </CardTitle>
            <Button
              onClick={() => setShowInfo(true)}
              size="sm"
              className="bg-green-800 hover:bg-green-700 text-yellow-400 border-2 border-yellow-500 h-7 w-7 p-0"
            >
              <Info className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pt-2 p-2 flex-1 overflow-y-auto">
          {!hasSettings ? (
            <div className="bg-yellow-500/10 border-2 border-yellow-500 rounded-lg p-3 text-center">
              <p className="text-yellow-500 font-bold text-sm mb-2">
                Add a Material Type First
              </p>
              <Button
                onClick={() => setShowTrimTypeManagement(true)}
                className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-3 py-1.5 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Material
              </Button>
            </div>
          ) : (
            <>
              {/* Material Type Selection */}
              <div className="bg-black/30 p-2 rounded-lg border-2 border-green-800">
                <Label className="text-yellow-400 font-semibold text-xs mb-1 block">
                  Material Type
                </Label>
                <div className="flex gap-1">
                  <Select value={selectedTrimTypeId} onValueChange={setSelectedTrimTypeId}>
                    <SelectTrigger className="h-8 bg-white border-2 border-green-700 focus:border-yellow-500 text-sm font-semibold flex-1">
                      <SelectValue placeholder="Select material..." />
                    </SelectTrigger>
                    <SelectContent>
                      {trimTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTrimType && (
                    <Button
                      onClick={() => setShowMaterialInfo(true)}
                      size="sm"
                      className="bg-blue-700 hover:bg-blue-600 text-white font-bold border border-blue-500 h-8 px-2 text-xs"
                    >
                      <Info className="w-3 h-3" />
                    </Button>
                  )}
                  <Button
                    onClick={() => setShowTrimTypeManagement(true)}
                    size="sm"
                    className="bg-green-700 hover:bg-green-600 text-yellow-400 font-bold border border-yellow-500 h-8 px-2 text-xs"
                  >
                    <Settings className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              
              {/* Steel Section - Dynamic Inch Inputs */}
              <div className="space-y-1.5 bg-black/30 p-2 rounded-lg border-2 border-green-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-yellow-500 uppercase">Measurements</h3>
                  <Button
                    onClick={addInchInput}
                    size="sm"
                    className="bg-green-700 hover:bg-green-600 text-yellow-400 font-bold border border-yellow-500 h-6 px-2 text-xs"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add
                  </Button>
                </div>
                
                <div className="grid gap-1.5 max-h-36 overflow-y-auto">
                  {inchInputs.map((input, index) => (
                    <div key={input.id} className="flex items-center gap-1.5">
                      <div className="flex-1">
                        <Label className="text-xs text-yellow-400 mb-0.5 block">
                          Length #{index + 1}
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.125"
                          value={input.value}
                          onChange={(e) => updateInchInput(input.id, e.target.value)}
                          placeholder="0"
                          className="h-8 text-center text-base bg-white border-2 border-green-700 font-bold focus:border-yellow-500"
                        />
                      </div>
                      {inchInputs.length > 1 && (
                        <Button
                          onClick={() => removeInchInput(input.id)}
                          size="sm"
                          variant="ghost"
                          className="mt-5 text-red-400 hover:text-red-300 hover:bg-red-900/20 h-6 w-6 p-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Bends Input */}
                <div className="space-y-1 pt-1.5 border-t border-green-800">
                  <Label className="text-yellow-400 font-semibold text-xs">Bends</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={numberOfBends}
                    onChange={(e) => setNumberOfBends(e.target.value)}
                    placeholder="0"
                    className="h-8 text-center text-base bg-white border-2 border-green-700 font-bold focus:border-yellow-500"
                  />
                </div>
              </div>

              {/* Results Section - Just Selling Price */}
              <div className="space-y-1.5 pt-1.5 border-t-2 border-yellow-500">
                {/* Final Selling Price */}
                <div className="bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-600 rounded-lg p-2 text-center border-2 border-yellow-400 shadow-lg">
                  <div className="text-black font-bold text-sm">SELLING PRICE</div>
                  <div className="text-3xl font-black text-black">${sellingPrice.toFixed(2)}</div>
                </div>

                {/* Clear Button */}
                <Button
                  onClick={clearCalculation}
                  variant="outline"
                  className="w-full border-2 border-red-500 text-red-400 hover:bg-red-900/20 hover:text-red-300 font-bold h-7 text-xs"
                >
                  <X className="w-3 h-3 mr-1" />
                  Clear All
                </Button>
              </div>

              {/* Save/Load/Price List Buttons */}
              <div className="space-y-1.5 pt-1.5 border-t-2 border-green-800">
                <div className="flex gap-1.5">
                  <Button
                    onClick={() => setShowSaveDialog(true)}
                    className="flex-1 bg-gradient-to-r from-green-700 to-green-800 hover:from-green-600 hover:to-green-700 text-yellow-400 font-bold border border-yellow-500 h-7 text-xs"
                  >
                    <Save className="w-3 h-3 mr-1" />
                    Save
                  </Button>
                  <Button
                    onClick={() => setShowLoadDialog(true)}
                    className="flex-1 bg-gradient-to-r from-green-700 to-green-800 hover:from-green-600 hover:to-green-700 text-yellow-400 font-bold border border-yellow-500 h-7 text-xs"
                  >
                    <FolderOpen className="w-3 h-3 mr-1" />
                    Load ({savedConfigs.length})
                  </Button>
                </div>
                <Button
                  type="button"
                  disabled={savedConfigs.length === 0}
                  onClick={() => {
                    setExportTrimScope('standard');
                    setExportIncludeTrimTypes(true);
                    setShowExportTrimsDialog(true);
                  }}
                  variant="outline"
                  className="w-full border-2 border-green-600 text-yellow-300 hover:bg-green-900/30 font-bold h-7 text-xs disabled:opacity-40"
                >
                  <Download className="w-3 h-3 mr-1" />
                  Export JSON…
                </Button>
                <Button
                  onClick={() => {
                    if (trimTypes.length === 0) {
                      toast.error('Add material types first');
                      return;
                    }
                    if (savedConfigs.length === 0) {
                      toast.error('No saved trims to price');
                      return;
                    }
                    setPriceListMaterialId(selectedTrimTypeId || trimTypes[0].id);
                    setShowPriceList(true);
                  }}
                  className="w-full bg-gradient-to-r from-blue-700 to-blue-800 hover:from-blue-600 hover:to-blue-700 text-yellow-400 font-bold border border-yellow-500 h-7 text-xs"
                >
                  <Calculator className="w-3 h-3 mr-1" />
                  Price List ({savedConfigs.length} trims)
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
      {/* Material Type Management Dialog */}
      <Dialog open={showTrimTypeManagement} onOpenChange={setShowTrimTypeManagement}>
        <DialogContent className="sm:max-w-3xl bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500 text-xl">
              <Settings className="w-6 h-6" />
              Material Type Management
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Add/Edit Form */}
            <div className="bg-black/30 p-4 rounded-lg border-2 border-green-800">
              <h3 className="text-yellow-400 font-bold mb-3">
                {editingTrimType ? 'Edit Material Type' : 'Add New Material Type'}
              </h3>
              <div className="space-y-3">
                <div>
                  <Label className="text-yellow-400">Name</Label>
                  <Input
                    value={newTrimTypeName}
                    onChange={(e) => setNewTrimTypeName(e.target.value)}
                    placeholder="e.g., Standard 42 inch Sheet"
                    className="bg-white border-green-700"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-yellow-400">Width (inches)</Label>
                    <Input
                      type="number"
                      min="1"
                      step="0.01"
                      value={newTrimTypeWidth}
                      onChange={(e) => setNewTrimTypeWidth(e.target.value)}
                      placeholder="42"
                      className="bg-white border-green-700"
                    />
                  </div>
                  <div>
                    <Label className="text-yellow-400">Cost per LF ($)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newTrimTypeCost}
                      onChange={(e) => setNewTrimTypeCost(e.target.value)}
                      placeholder="3.46"
                      className="bg-white border-green-700"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-yellow-400">Price per Bend ($)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newTrimTypeBendPrice}
                      onChange={(e) => setNewTrimTypeBendPrice(e.target.value)}
                      placeholder="1.00"
                      className="bg-white border-green-700"
                    />
                  </div>
                  <div>
                    <Label className="text-yellow-400">Markup (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={newTrimTypeMarkup}
                      onChange={(e) => setNewTrimTypeMarkup(e.target.value)}
                      placeholder="35"
                      className="bg-white border-green-700"
                    />
                  </div>
                  <div>
                    <Label className="text-yellow-400">Cut Price ($)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newTrimTypeCutPrice}
                      onChange={(e) => setNewTrimTypeCutPrice(e.target.value)}
                      placeholder="1.00"
                      className="bg-white border-green-700"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={saveTrimType}
                    className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
                  >
                    {editingTrimType ? 'Update' : 'Add'} Material
                  </Button>
                  {editingTrimType && (
                    <Button
                      onClick={cancelEditTrimType}
                      variant="outline"
                      className="border-green-700 text-yellow-400"
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Material List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {trimTypes.length === 0 ? (
                <div className="text-center py-8 text-white/50">
                  No materials yet. Add your first material above.
                </div>
              ) : (
                trimTypes.map((type) => (
                  <div
                    key={type.id}
                    className="bg-black/30 border border-green-800 rounded p-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-yellow-400 font-semibold text-lg">{type.name}</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm text-white/80">
                          <div className="flex justify-between">
                            <span>Width:</span>
                            <span className="font-semibold text-white">{type.width_inches}"</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Cost/LF:</span>
                            <span className="font-semibold text-white">${type.cost_per_lf}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Bend Price:</span>
                            <span className="font-semibold text-white">${type.price_per_bend}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Markup:</span>
                            <span className="font-semibold text-white">{type.markup_percent}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Cut Price:</span>
                            <span className="font-semibold text-white">${type.cut_price}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          onClick={() => startEditTrimType(type)}
                          size="sm"
                          variant="outline"
                          className="border-green-700 text-yellow-400"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => deleteTrimType(type.id)}
                          size="sm"
                          variant="outline"
                          className="border-red-500 text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <Button
              onClick={() => setShowTrimTypeManagement(false)}
              variant="outline"
              className="w-full border-green-700 text-yellow-400"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Material Info Dialog */}
      <Dialog open={showMaterialInfo} onOpenChange={setShowMaterialInfo}>
        <DialogContent className="sm:max-w-md bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500">
              <Info className="w-5 h-5" />
              Material Details: {selectedTrimType?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedTrimType && (
            <div className="space-y-3">
              <div className="bg-black/30 border-2 border-green-800 rounded-lg p-3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-white/80">
                    <span className="text-yellow-400 font-semibold">Width:</span>
                    <span className="font-bold text-white">{selectedTrimType.width_inches}"</span>
                  </div>
                  <div className="flex justify-between text-white/80">
                    <span className="text-yellow-400 font-semibold">Cost per LF:</span>
                    <span className="font-bold text-white">${selectedTrimType.cost_per_lf}</span>
                  </div>
                  <div className="flex justify-between text-white/80">
                    <span className="text-yellow-400 font-semibold">Price per Bend:</span>
                    <span className="font-bold text-white">${selectedTrimType.price_per_bend}</span>
                  </div>
                  <div className="flex justify-between text-white/80">
                    <span className="text-yellow-400 font-semibold">Markup Percentage:</span>
                    <span className="font-bold text-white">{selectedTrimType.markup_percent}%</span>
                  </div>
                  <div className="flex justify-between text-white/80">
                    <span className="text-yellow-400 font-semibold">Cut Price:</span>
                    <span className="font-bold text-white">${selectedTrimType.cut_price}</span>
                  </div>
                </div>
              </div>
              <Button
                onClick={() => setShowMaterialInfo(false)}
                variant="outline"
                className="w-full border-green-700 text-yellow-400"
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Save Dialog */}
      <Dialog
        open={showSaveDialog}
        onOpenChange={(open) => {
          setShowSaveDialog(open);
          if (open) setSaveAsCustomTrim(false);
        }}
      >
        <DialogContent className="sm:max-w-md bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500">
              <Save className="w-5 h-5" />
              Save Configuration
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-yellow-400">Configuration Name</Label>
              <Input
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="e.g., J-Channel Trim"
                className="bg-white border-green-700"
              />
            </div>
            <div>
              <Label className="text-yellow-400 mb-2 block">Trim type</Label>
              <div className="flex rounded-lg border border-green-700 overflow-hidden bg-black/40 p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() => setSaveAsCustomTrim(false)}
                  className={`flex-1 py-2 px-3 text-sm font-semibold rounded-md transition-colors ${
                    !saveAsCustomTrim ? 'bg-yellow-500 text-black' : 'text-yellow-400/90 hover:bg-green-900/50'
                  }`}
                >
                  Standard trim
                </button>
                <button
                  type="button"
                  onClick={() => setSaveAsCustomTrim(true)}
                  className={`flex-1 py-2 px-3 text-sm font-semibold rounded-md transition-colors ${
                    saveAsCustomTrim ? 'bg-yellow-500 text-black' : 'text-yellow-400/90 hover:bg-green-900/50'
                  }`}
                >
                  Custom trim
                </button>
              </div>
              <p className="text-xs text-white/55 mt-1.5">
                Standard trims appear in the default list when loading. Use custom for job-specific or one-off profiles.
              </p>
            </div>
            <div>
              <Label className="text-yellow-400">Link to Job (Optional)</Label>
              <div className="space-y-2">
                <Select value={selectedJobId || undefined} onValueChange={setSelectedJobId}>
                  <SelectTrigger className="bg-white border-green-700">
                    <SelectValue placeholder="No job selected" />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.job_number ? `${job.job_number} - ` : ''}{job.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedJobId && (
                  <>
                    <Button
                      onClick={() => setSelectedJobId('')}
                      variant="outline"
                      size="sm"
                      className="w-full border-red-500 text-red-400 hover:bg-red-900/20"
                    >
                      Clear Job Selection
                    </Button>
                    <label className="flex items-center gap-2 text-sm text-white/90 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addToJobWorkbook}
                        onChange={(e) => setAddToJobWorkbook(e.target.checked)}
                        className="rounded border-green-600"
                      />
                      Add to job workbook (shop will see drawing in pull form)
                    </label>
                    {addToJobWorkbook && (
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <Label className="text-white/80 text-xs">Qty</Label>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={workbookAddQty}
                            onChange={(e) => setWorkbookAddQty(e.target.value)}
                            placeholder="1"
                            className="bg-white border-green-700 mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-white/80 text-xs">Color (optional)</Label>
                          <Input
                            value={workbookAddColor}
                            onChange={(e) => setWorkbookAddColor(e.target.value)}
                            placeholder="e.g. White"
                            className="bg-white border-green-700 mt-1"
                          />
                        </div>
                        <p className="text-white/60 text-xs col-span-2">
                          Custom trim will be added with SKU CW-CBT10 and current cost/price from this configuration.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            {linkToMaterialItemId && (
              <div className="bg-amber-900/40 border border-amber-600 rounded p-3">
                <p className="text-amber-300 text-sm">This trim will also be linked to the material item you selected in the workbook. Shop will see the drawing in the pull form.</p>
              </div>
            )}
            <div className="bg-black/30 border border-green-800 rounded p-3">
              <p className="text-yellow-400 font-semibold text-sm mb-2">Will save:</p>
              <ul className="text-white/80 text-sm space-y-1">
                <li>• Total: {totalInches.toFixed(2)}" with {numberOfBends} bends</li>
                <li>• Material: {selectedTrimType?.name || 'None'}</li>
                {drawing.segments.length > 0 && (
                  <li>• Drawing with {drawing.segments.length} segments</li>
                )}
              </ul>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={saveConfiguration}
                disabled={saving}
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
              >
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button
                onClick={() => setShowSaveDialog(false)}
                variant="outline"
                className="border-green-700 text-yellow-400"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Load Dialog */}
      <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500">
              <FolderOpen className="w-5 h-5" />
              Load Saved Configuration
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {savedConfigs.length === 0 ? (
              <div className="text-center py-8 text-white/50">
                No saved configurations yet
              </div>
            ) : (
              <>
                <Tabs value={loadSavedTrimTab} onValueChange={(v) => setLoadSavedTrimTab(v as 'standard' | 'custom')}>
                  <TabsList className="grid w-full grid-cols-2 h-auto gap-1 bg-black/40 border border-green-800 p-1 rounded-lg">
                    <TabsTrigger
                      value="standard"
                      className="data-[state=active]:bg-yellow-500 data-[state=active]:text-black text-yellow-400 text-sm py-2"
                    >
                      Standard trims ({savedConfigs.filter((c) => !isSavedConfigCustom(c)).length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="custom"
                      className="data-[state=active]:bg-yellow-500 data-[state=active]:text-black text-yellow-400 text-sm py-2"
                    >
                      Custom trims ({savedConfigs.filter((c) => isSavedConfigCustom(c)).length})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-yellow-500/70"
                    aria-hidden
                  />
                  <Input
                    value={loadConfigSearch}
                    onChange={(e) => setLoadConfigSearch(e.target.value)}
                    placeholder="Search name, job, material, bends, inches, price…"
                    className="border-green-800 bg-black/40 pl-9 text-white placeholder:text-white/40"
                    aria-label="Search saved configurations"
                  />
                </div>
              {(() => {
                const tabFiltered =
                  loadSavedTrimTab === 'standard'
                    ? savedConfigs.filter((c) => !isSavedConfigCustom(c))
                    : savedConfigs.filter((c) => isSavedConfigCustom(c));
                const q = loadConfigSearch.trim().toLowerCase();
                const words = q.split(/\s+/).filter(Boolean);
                const visible = tabFiltered.filter((c) => {
                  if (words.length === 0) return true;
                  let totalInchesStr = '';
                  try {
                    const inchesArray = typeof c.inches === 'string' ? JSON.parse(c.inches) : c.inches;
                    if (Array.isArray(inchesArray)) {
                      totalInchesStr = inchesArray.reduce((a: number, b: number) => a + Number(b), 0).toFixed(2);
                    }
                  } catch {
                    /* ignore */
                  }
                  const p = calculateConfigPricing(c);
                  const hay = [
                    c.name,
                    c.material_type_name,
                    c.job_name,
                    String(c.bends),
                    totalInchesStr,
                    p.price.toFixed(2),
                    String(Math.round(p.price)),
                    p.markupPercent.toFixed(1),
                    new Date(c.created_at).toLocaleDateString(),
                  ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                  return words.every((w) => hay.includes(w));
                });
                if (tabFiltered.length === 0) {
                  return (
                    <div className="text-center py-6 text-white/50 text-sm border border-green-800/50 rounded-lg bg-black/20">
                      No {loadSavedTrimTab === 'standard' ? 'standard' : 'custom'} saved configurations yet.
                      {loadSavedTrimTab === 'standard'
                        ? ' Save a new configuration as Standard trim, or switch to Custom.'
                        : ' Mark saves as Custom trim (existing job-linked saves appear here).'}
                    </div>
                  );
                }
                if (visible.length === 0) {
                  return (
                    <div className="text-center py-6 text-white/50 text-sm border border-green-800/50 rounded-lg bg-black/20">
                      No configurations match your search. Try different words or clear the search box.
                    </div>
                  );
                }
                return (
              <div className="space-y-2">
                {visible.map((config) => {
                  const pricing = calculateConfigPricing(config);
                  return (
                    <div
                      key={config.id}
                      className="relative bg-black/30 border-2 border-green-800 rounded-lg p-4"
                    >
                      {/* Delete: small trash icon in top-right corner */}
                      <Button
                        type="button"
                        disabled={deletingConfigId === config.id}
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          await deleteConfiguration(String(config.id));
                        }}
                        size="icon"
                        variant="ghost"
                        className="absolute top-2 right-2 h-8 w-8 shrink-0 rounded-md border border-red-500/50 text-red-400 hover:bg-red-900/40 hover:text-red-300"
                        title="Delete"
                      >
                        {deletingConfigId === config.id ? (
                          <span className="text-[10px]">…</span>
                        ) : (
                          <Trash className="h-4 w-4" />
                        )}
                      </Button>

                      <div className="flex items-center gap-4 pr-8">
                        {/* Preview thumbnail if has drawing */}
                        {config.drawing_segments && config.drawing_segments.length > 0 && (
                          <div className="w-24 h-24 shrink-0 bg-white rounded border-2 border-green-700 overflow-hidden">
                            <TrimDrawingPreview
                              segments={config.drawing_segments}
                              width={96}
                              height={96}
                              hemDepthInches={hemDepthInches}
                              className="w-full h-full"
                            />
                          </div>
                        )}

                        {/* Info: title with bends & price close, then rest */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-yellow-400 font-bold text-lg">{config.name}</div>
                            {isSavedConfigCustom(config) ? (
                              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border border-amber-500/70 text-amber-300 bg-amber-950/40">
                                Custom
                              </span>
                            ) : (
                              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border border-green-600/70 text-green-300 bg-green-950/40">
                                Standard
                              </span>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={reclassifyingConfigId === String(config.id)}
                              title={
                                isSavedConfigCustom(config)
                                  ? 'Show this trim under Standard (library) list'
                                  : 'Show this trim under Custom list'
                              }
                              className="h-7 border-yellow-600/50 px-2 text-[11px] text-yellow-200 hover:bg-yellow-900/30"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void setSavedConfigClassification(String(config.id), !isSavedConfigCustom(config));
                              }}
                            >
                              {reclassifyingConfigId === String(config.id)
                                ? '…'
                                : isSavedConfigCustom(config)
                                  ? 'Move to Standard'
                                  : 'Move to Custom'}
                            </Button>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm mt-0.5 text-white/80">
                            <span>Bends: <span className="font-semibold text-white">{config.bends}</span></span>
                            <span>Price: <span className="font-bold text-yellow-400">${pricing.price.toFixed(2)}</span></span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm mt-2">
                            <div className="flex justify-between text-white/70">
                              <span>Total Inches:</span>
                              <span className="font-semibold text-white">{(() => {
                                try {
                                  const inchesArray = typeof config.inches === 'string' ? JSON.parse(config.inches) : config.inches;
                                  return Array.isArray(inchesArray) ? inchesArray.reduce((a: number, b: number) => a + b, 0).toFixed(2) + '"' : '0.00"';
                                } catch { return '0.00"'; }
                              })()}</span>
                            </div>
                            <div className="flex justify-between text-white/70">
                              <span>Saved Material:</span>
                              <span className="font-semibold text-green-400">{config.material_type_name || 'Unknown'}</span>
                            </div>
                            {config.job_name && (
                              <div className="flex justify-between text-white/70 col-span-2">
                                <span>Job:</span>
                                <span className="font-semibold text-white">{config.job_name}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-white/70">
                              <span>Markup:</span>
                              <span className="font-semibold text-green-400">{pricing.markupPercent.toFixed(1)}%</span>
                            </div>
                          </div>
                          <div className="text-xs text-white/50 mt-1.5">
                            Saved: {new Date(config.created_at).toLocaleString()}
                          </div>
                        </div>

                        {/* Load button: centered in the card */}
                        <div className="flex shrink-0 items-center justify-center">
                          <Button
                            onClick={() => loadConfiguration(config)}
                            className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-6"
                          >
                            Load
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
                );
              })()}
              </>
            )}
            <Button
              onClick={() => setShowLoadDialog(false)}
              variant="outline"
              className="w-full border-green-700 text-yellow-400"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export trim library (JSON download) */}
      <Dialog open={showExportTrimsDialog} onOpenChange={setShowExportTrimsDialog}>
        <DialogContent className="sm:max-w-md bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500">
              <Download className="w-5 h-5" />
              Export trim library
            </DialogTitle>
            <DialogDescription className="text-white/70">
              Download saved trims as JSON (same classification as Load: Standard vs Custom). Optionally include active
              material types from this session for pricing context.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Tabs value={exportTrimScope} onValueChange={(v) => setExportTrimScope(v as 'standard' | 'custom' | 'all')}>
              <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-lg border border-green-800 bg-black/40 p-1">
                <TabsTrigger
                  value="standard"
                  className="data-[state=active]:bg-yellow-500 data-[state=active]:text-black text-yellow-400 text-xs py-2"
                >
                  Standard ({savedConfigs.filter((c) => !isSavedConfigCustom(c)).length})
                </TabsTrigger>
                <TabsTrigger
                  value="custom"
                  className="data-[state=active]:bg-yellow-500 data-[state=active]:text-black text-yellow-400 text-xs py-2"
                >
                  Custom ({savedConfigs.filter((c) => isSavedConfigCustom(c)).length})
                </TabsTrigger>
                <TabsTrigger
                  value="all"
                  className="data-[state=active]:bg-yellow-500 data-[state=active]:text-black text-yellow-400 text-xs py-2"
                >
                  All ({savedConfigs.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-yellow-200/90">
              <Checkbox
                checked={exportIncludeTrimTypes}
                onCheckedChange={(v) => setExportIncludeTrimTypes(v === true)}
                className="border-yellow-500 data-[state=checked]:bg-yellow-500 data-[state=checked]:text-black"
              />
              Include material types (trim_types){trimTypes.length === 0 ? ' — none loaded yet' : ` (${trimTypes.length})`}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="border-green-700 text-yellow-400"
                onClick={() => setShowExportTrimsDialog(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-yellow-500 font-bold text-black hover:bg-yellow-400"
                onClick={performTrimLibraryExport}
              >
                <Download className="mr-2 h-4 w-4" />
                Download JSON
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Price List Dialog */}
      <Dialog
        open={showPriceList}
        onOpenChange={(open) => {
          setShowPriceList(open);
          if (!open) setPriceListPdfSelectedIds(new Set());
        }}
      >
        <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500">
              <Calculator className="w-5 h-5" />
              Trim Price List
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenCombineTrimPdfDialog}
                className="border-yellow-500/80 text-yellow-300 hover:bg-yellow-900/30"
              >
                <Layers className="w-4 h-4 mr-2" />
                Combined PDF…
              </Button>
              <span className="text-white/60 text-xs">
                Select rows (checkbox), then set length &amp; color per drawing in the next step.
              </span>
            </div>
            {/* Material Type Selector */}
            <div className="bg-black/30 border-2 border-green-800 rounded-lg p-3">
              <Label className="text-yellow-400 font-semibold mb-2 block">
                Calculate Prices Using Material Type:
              </Label>
              <Select value={priceListMaterialId} onValueChange={setPriceListMaterialId}>
                <SelectTrigger className="bg-white border-green-700">
                  <SelectValue placeholder="Select material..." />
                </SelectTrigger>
                <SelectContent>
                  {trimTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Price List Table */}
            {priceListMaterialId && (() => {
              const selectedMaterial = trimTypes.find(t => t.id === priceListMaterialId);
              if (!selectedMaterial) return null;

              const configsForPriceList =
                priceListTrimTab === 'standard'
                  ? savedConfigs.filter((c) => !isSavedConfigCustom(c))
                  : savedConfigs.filter((c) => isSavedConfigCustom(c));

              // Calculate prices for all configs using selected material
              const pricedConfigs = configsForPriceList.map(config => {
                // Parse inches
                let inchesArray: number[];
                try {
                  if (typeof config.inches === 'string') {
                    inchesArray = JSON.parse(config.inches);
                  } else if (Array.isArray(config.inches)) {
                    inchesArray = config.inches;
                  } else {
                    return null;
                  }
                  if (!Array.isArray(inchesArray)) return null;
                } catch {
                  return null;
                }
                
                const totalInches = inchesArray.reduce((sum: number, val: number) => sum + val, 0);
                
                // Calculate pricing using selected material
                const lfCost = selectedMaterial.cost_per_lf;
                const sheetWidth = selectedMaterial.width_inches;
                const bendPriceVal = selectedMaterial.price_per_bend;
                const markup = selectedMaterial.markup_percent;
                const cutPriceVal = selectedMaterial.cut_price;
                
                const sheetCost = lfCost * 10;
                const costPerInchBeforeMarkup = sheetCost / sheetWidth;
                const materialCost = totalInches * costPerInchBeforeMarkup;
                
                const markupMultiplier = 1 + (markup / 100);
                const markedUpSheetCost = sheetCost * markupMultiplier;
                const pricePerInch = markedUpSheetCost / sheetWidth;
                
                const totalInchCost = totalInches * pricePerInch;
                const totalBendCost = config.bends * bendPriceVal;
                const totalCutCost = cutPriceVal;
                
                const sellingPrice = totalInchCost + totalBendCost + totalCutCost;
                const totalCost = materialCost + totalBendCost + totalCutCost;
                const markupAmount = sellingPrice - totalCost;
                
                return {
                  config,
                  totalInches,
                  materialCost,
                  markupAmount,
                  bendCost: totalBendCost,
                  cutCost: totalCutCost,
                  sellingPrice,
                  pdfDrawingSegments: parseDrawingSegmentsFromSavedConfig(config),
                };
              }).filter(Boolean);
              
              return (
                <div className="space-y-3">
                <Tabs value={priceListTrimTab} onValueChange={(v) => setPriceListTrimTab(v as 'standard' | 'custom')}>
                  <TabsList className="grid w-full grid-cols-2 h-auto gap-1 bg-black/40 border border-green-800 p-1 rounded-lg">
                    <TabsTrigger
                      value="standard"
                      className="data-[state=active]:bg-yellow-500 data-[state=active]:text-black text-yellow-400 text-sm py-2"
                    >
                      Standard ({savedConfigs.filter((c) => !isSavedConfigCustom(c)).length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="custom"
                      className="data-[state=active]:bg-yellow-500 data-[state=active]:text-black text-yellow-400 text-sm py-2"
                    >
                      Custom ({savedConfigs.filter((c) => isSavedConfigCustom(c)).length})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="bg-black/30 border-2 border-green-800 rounded-lg overflow-hidden">
                  <div className="bg-green-900/50 p-3 border-b-2 border-green-800">
                    <div className="text-yellow-400 font-bold">
                      {selectedMaterial.name}
                    </div>
                    <div className="text-white/70 text-sm mt-1">
                      {selectedMaterial.width_inches}" width • ${selectedMaterial.cost_per_lf}/LF • 
                      ${selectedMaterial.price_per_bend}/bend • {selectedMaterial.markup_percent}% markup
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-green-900/30 border-b border-green-800">
                          <th className="text-center p-2 text-yellow-400 font-semibold w-10">PDF</th>
                          <th className="text-left p-2 text-yellow-400 font-semibold">Trim Name</th>
                          <th className="text-right p-2 text-yellow-400 font-semibold">Total Inches</th>
                          <th className="text-right p-2 text-yellow-400 font-semibold">Bends</th>
                          <th className="text-right p-2 text-yellow-400 font-semibold">Material Cost</th>
                          <th className="text-right p-2 text-yellow-400 font-semibold">Markup</th>
                          <th className="text-right p-2 text-yellow-400 font-semibold">Bend Cost</th>
                          <th className="text-right p-2 text-yellow-400 font-semibold">Cut</th>
                          <th className="text-right p-2 text-yellow-400 font-semibold">Selling Price</th>
                          <th className="text-center p-2 text-yellow-400 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pricedConfigs.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="text-center py-8 text-white/50">
                              No valid trim configurations found
                            </td>
                          </tr>
                        ) : (
                          pricedConfigs.map((item: any) => (
                            <tr key={item.config.id} className="border-b border-green-800/30 hover:bg-green-900/20">
                              <td className="text-center p-2 align-middle">
                                <Checkbox
                                  checked={priceListPdfSelectedIds.has(item.config.id)}
                                  disabled={item.pdfDrawingSegments.length === 0}
                                  onCheckedChange={(checked) => {
                                    setPriceListPdfSelectedIds((prev) => {
                                      const next = new Set(prev);
                                      if (checked === true) next.add(item.config.id);
                                      else next.delete(item.config.id);
                                      return next;
                                    });
                                  }}
                                  className="border-yellow-600 data-[state=checked]:bg-yellow-500 data-[state=checked]:text-black"
                                  aria-label={`Include ${item.config.name} in combined PDF`}
                                />
                              </td>
                              <td className="p-2 text-white font-medium">
                                {item.config.name}
                                {item.config.job_name && (
                                  <div className="text-xs text-white/50">{item.config.job_name}</div>
                                )}
                              </td>
                              <td className="text-right p-2 text-white">{item.totalInches.toFixed(2)}"</td>
                              <td className="text-right p-2 text-white">{item.config.bends}</td>
                              <td className="text-right p-2 text-white/80">${item.materialCost.toFixed(2)}</td>
                              <td className="text-right p-2 text-green-400">${item.markupAmount.toFixed(2)}</td>
                              <td className="text-right p-2 text-white/80">${item.bendCost.toFixed(2)}</td>
                              <td className="text-right p-2 text-white/80">${item.cutCost.toFixed(2)}</td>
                              <td className="text-right p-2 text-yellow-400 font-bold">${item.sellingPrice.toFixed(2)}</td>
                              <td className="text-center p-2">
                                <div className="flex items-center justify-center gap-1 flex-wrap">
                                  <Button
                                    onClick={() => {
                                      setSelectedTrimTypeId(priceListMaterialId);
                                      setTimeout(() => {
                                        loadConfiguration(item.config);
                                        setShowPriceList(false);
                                      }, 100);
                                    }}
                                    size="sm"
                                    className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold h-7 px-2 text-xs"
                                  >
                                    Load
                                  </Button>
                                  <Button
                                    type="button"
                                    onClick={() =>
                                      downloadTrimDrawingPdfForSavedTrim(
                                        item.config.name,
                                        item.pdfDrawingSegments
                                      )
                                    }
                                    disabled={item.pdfDrawingSegments.length === 0}
                                    size="sm"
                                    variant="outline"
                                    className="border-yellow-500/80 text-yellow-300 hover:bg-yellow-900/30 h-7 px-2 text-xs"
                                    title="Download trim drawing as PDF"
                                  >
                                    <Download className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    disabled={reclassifyingConfigId === String(item.config.id)}
                                    onClick={() =>
                                      void setSavedConfigClassification(
                                        String(item.config.id),
                                        !isSavedConfigCustom(item.config)
                                      )
                                    }
                                    size="sm"
                                    variant="outline"
                                    className="border-yellow-600/70 text-yellow-200 hover:bg-yellow-900/30 h-7 px-2 text-xs"
                                    title={
                                      isSavedConfigCustom(item.config)
                                        ? 'Move to Standard (library) list'
                                        : 'Move to Custom list'
                                    }
                                  >
                                    {reclassifyingConfigId === String(item.config.id)
                                      ? '…'
                                      : isSavedConfigCustom(item.config)
                                        ? '→ Std'
                                        : '→ Custom'}
                                  </Button>
                                  <Button
                                    onClick={async () => {
                                      if (!confirm(`Delete "${item.config.name}" from the trim list?`)) return;
                                      await deleteConfiguration(item.config.id);
                                    }}
                                    size="sm"
                                    variant="outline"
                                    className="border-red-500 text-red-400 hover:bg-red-900/30 h-7 px-2 text-xs"
                                  >
                                    <Trash className="w-3 h-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {pricedConfigs.length > 0 && (
                        <tfoot>
                          <tr className="bg-green-900/50 font-bold border-t-2 border-green-700">
                            <td />
                            <td className="p-2 text-yellow-400">TOTAL ({pricedConfigs.length} trims)</td>
                            <td className="text-right p-2 text-white">
                              {pricedConfigs.reduce((sum: number, item: any) => sum + item.totalInches, 0).toFixed(2)}"
                            </td>
                            <td className="text-right p-2 text-white">
                              {pricedConfigs.reduce((sum: number, item: any) => sum + item.config.bends, 0)}
                            </td>
                            <td className="text-right p-2 text-white">
                              ${pricedConfigs.reduce((sum: number, item: any) => sum + item.materialCost, 0).toFixed(2)}
                            </td>
                            <td className="text-right p-2 text-green-400">
                              ${pricedConfigs.reduce((sum: number, item: any) => sum + item.markupAmount, 0).toFixed(2)}
                            </td>
                            <td className="text-right p-2 text-white">
                              ${pricedConfigs.reduce((sum: number, item: any) => sum + item.bendCost, 0).toFixed(2)}
                            </td>
                            <td className="text-right p-2 text-white">
                              ${pricedConfigs.reduce((sum: number, item: any) => sum + item.cutCost, 0).toFixed(2)}
                            </td>
                            <td className="text-right p-2 text-yellow-400 text-lg">
                              ${pricedConfigs.reduce((sum: number, item: any) => sum + item.sellingPrice, 0).toFixed(2)}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
                </div>
              );
            })()}

            <Button
              onClick={() => setShowPriceList(false)}
              variant="outline"
              className="w-full border-green-700 text-yellow-400"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCombineTrimPdfDialog} onOpenChange={setShowCombineTrimPdfDialog}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="text-yellow-500 flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Combined trim PDF
            </DialogTitle>
          </DialogHeader>
          <p className="text-white/70 text-sm">
            One page per trim. Set qty, length, and color for each drawing before downloading.
          </p>
          <div className="border border-green-800 rounded-lg overflow-hidden mt-3">
            <table className="w-full text-sm text-white table-fixed">
              <thead>
                <tr className="bg-green-900/40 border-b border-green-800">
                  <th className="text-left p-2 text-yellow-400 font-semibold w-[28%]">Trim name</th>
                  <th className="text-left p-2 text-yellow-400 font-semibold w-20">Qty</th>
                  <th className="text-left p-2 text-yellow-400 font-semibold w-[22%]">Length</th>
                  <th className="text-left p-2 text-yellow-400 font-semibold">Color</th>
                </tr>
              </thead>
              <tbody>
                {combineTrimPdfDraft.map((row, index) => (
                  <tr key={row.configId} className="border-b border-green-800/40">
                    <td className="p-2 font-medium align-top break-words">{row.name}</td>
                    <td className="p-2 align-top">
                      <Input
                        className="bg-white text-black h-9 text-sm border-green-800 w-full min-w-[4rem]"
                        inputMode="decimal"
                        placeholder="1"
                        value={row.qtyText}
                        onChange={(e) =>
                          setCombineTrimPdfDraft((prev) =>
                            prev.map((r, i) => (i === index ? { ...r, qtyText: e.target.value } : r))
                          )
                        }
                      />
                    </td>
                    <td className="p-2 align-top">
                      <Input
                        className="bg-white text-black h-9 text-sm border-green-800"
                        value={row.lengthText}
                        onChange={(e) =>
                          setCombineTrimPdfDraft((prev) =>
                            prev.map((r, i) => (i === index ? { ...r, lengthText: e.target.value } : r))
                          )
                        }
                      />
                    </td>
                    <td className="p-2 align-top">
                      <Input
                        className="bg-white text-black h-9 text-sm border-green-800"
                        placeholder="e.g. Charcoal"
                        value={row.colorText}
                        onChange={(e) =>
                          setCombineTrimPdfDraft((prev) =>
                            prev.map((r, i) => (i === index ? { ...r, colorText: e.target.value } : r))
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-2 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCombineTrimPdfDialog(false)}
              className="border-green-700 text-yellow-400"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleDownloadCombinedTrimPdf()}
              className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold"
            >
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Info Dialog */}
      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent className="sm:max-w-lg bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500">
              <Info className="w-5 h-5" />
              Calculator Information
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Cost Breakdown */}
            {hasSettings && (totalInches > 0 || parseInt(numberOfBends) > 0) && (
              <div className="bg-black/30 border-2 border-green-800 rounded-lg p-3 space-y-2">
                <div className="text-green-400 font-bold text-sm uppercase mb-2">Current Cost Breakdown</div>
                
                <div className="flex justify-between text-sm text-white/80">
                  <span>Material Cost:</span>
                  <span className="font-bold text-white">${materialCost.toFixed(2)}</span>
                </div>
                
                <div className="flex justify-between text-sm text-white/80">
                  <span>+ Markup ({selectedTrimType?.markup_percent || 0}%):</span>
                  <span className="font-bold text-green-400">${markupAmount.toFixed(2)}</span>
                </div>
                
                <div className="flex justify-between text-sm text-white/80">
                  <span>+ Bends ({numberOfBends || 0}):</span>
                  <span className="font-bold text-white">${totalBendCost.toFixed(2)}</span>
                </div>
                
                <div className="flex justify-between text-sm text-white/80">
                  <span>+ Cut:</span>
                  <span className="font-bold text-white">${totalCutCost.toFixed(2)}</span>
                </div>
                
                <div className="border-t border-green-700 pt-2 mt-2"></div>
                
                <div className="flex justify-between text-sm text-yellow-400 font-bold">
                  <span>Total Selling Price:</span>
                  <span className="text-lg">${sellingPrice.toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="space-y-3 text-white/80 text-sm">
              <div>
                <p className="font-bold text-yellow-400 mb-1">Material Types:</p>
                <p>Create custom material types with their own pricing settings. Each material has its width, cost per linear foot, bend price, markup percentage, and cut price.</p>
              </div>
              <div>
                <p className="font-bold text-yellow-400 mb-1">Drawing Tool:</p>
                <p>Draw your trim shape on the grid. The calculator automatically updates as you draw. You can add hems (U-shaped folds) to any segment.</p>
              </div>
              <div>
                <p className="font-bold text-yellow-400 mb-1">Pricing Calculation:</p>
                <p>Material Cost = (Total Inches × Cost per Inch) where Cost per Inch = (LF Cost × 10 × Markup) ÷ Material Width. Final price includes material, bends, and cut.</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
