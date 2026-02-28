import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Calculator, Settings, Info, X, Plus, Trash2, Save, FolderOpen, Pencil, Trash, ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

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
  const [jobs, setJobs] = useState<any[]>([]);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingConfigId, setDeletingConfigId] = useState<string | null>(null);

  // Drawing feature states
  const [showDrawing, setShowDrawing] = useState(true); // Always show drawing
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState<DrawingState>({
    segments: [],
    selectedSegmentId: null,
    currentPoint: null,
    nextLabel: 65 // ASCII 'A'
  });
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawingLocked, setDrawingLocked] = useState(true);
  const [canvasReady, setCanvasReady] = useState(false);
  const [gridSize] = useState(0.125); // 1/8" snap precision
  const [majorGridSize] = useState(0.5); // 1/2" major grid blocks
  const [scale, setScale] = useState(80); // pixels per inch (adjustable with zoom)
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [editMode, setEditMode] = useState<EditMode | null>(null);
  const [hemPreviewMode, setHemPreviewMode] = useState<HemPreviewMode | null>(null);
  const [angleDisplayMode, setAngleDisplayMode] = useState<Record<string, boolean>>({});
  const [lengthInput, setLengthInput] = useState('');
  const lengthInputRef = useRef<HTMLInputElement>(null);
  const [previewConfig, setPreviewConfig] = useState<SavedConfig | null>(null);
  const [showPriceList, setShowPriceList] = useState(false);
  const [priceListMaterialId, setPriceListMaterialId] = useState<string>('');
  const BASE_CANVAS_WIDTH = 1400;
  const BASE_CANVAS_HEIGHT = 700;
  const CANVAS_WIDTH = BASE_CANVAS_WIDTH * (scale / 80);
  const CANVAS_HEIGHT = BASE_CANVAS_HEIGHT * (scale / 80);

  // Helper function to remove trailing zeros
  function cleanNumber(num: number, decimals: number = 3): string {
    return num.toFixed(decimals).replace(/\.?0+$/, '');
  }

  // Helper function to draw a hem
  function drawHem(
    ctx: CanvasRenderingContext2D, 
    segment: LineSegment, 
    scale: number, 
    isPreview: boolean = false,
    previewSide?: 'left' | 'right'
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
    
    // Hem: 1/2" along the trim, 180° double back; offset from trim by 2 line widths; ends connected
    const hemDepth = 0.5; // 1/2"
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
      ctx.setLineDash([5, 5]);
    } else {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
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
    ctx.lineWidth = isPreview ? 2 : 3;
    
    // Label offset perpendicular so it doesn't sit on the line
    if (isPreview) {
      ctx.fillStyle = '#9333ea';
      ctx.font = 'bold 14px sans-serif';
      const labelX = (p1x + p2x) / 2 + perpX * 10 * scale;
      const labelY = (p1y + p2y) / 2 + perpY * 10 * scale;
      ctx.fillText(`${side.toUpperCase()}?`, labelX - 20, labelY + 5);
    } else {
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px sans-serif';
      const labelX = (p1x + p2x) / 2 + perpX * 10 * scale;
      const labelY = (p1y + p2y) / 2 + perpY * 10 * scale;
      ctx.fillText('HEM', labelX - 15, labelY + 4);
      ctx.fillStyle = '#666666';
      ctx.font = '10px sans-serif';
      ctx.fillText('0.5"', labelX - 10, labelY + 16);
    }
  }

  // Initialize canvas when showing drawing
  useEffect(() => {
    if (showDrawing) {
      setCanvasReady(false);
      // Small delay to ensure canvas is mounted
      setTimeout(() => setCanvasReady(true), 100);
    } else {
      setCanvasReady(false);
    }
  }, [showDrawing]);

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

  /** All points where a new line can attach: segment start, end, and hem open end (if any). */
  function getSegmentConnectionPoints(segment: LineSegment): Point[] {
    const points: Point[] = [segment.start, segment.end];
    const hemOpen = getHemOpenEndPoint(segment);
    if (hemOpen) points.push(hemOpen);
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
      ctx.fillRect(midX - 40, midY - 30, 80, 24);
      
      // Measurement text (no trailing zeros)
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${cleanNumber(previewLength)}"`, midX, midY - 12);
      
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
        
        // Background for angle
        ctx.fillStyle = 'rgba(107, 33, 168, 0.9)';
        ctx.fillRect(startX + 5, startY - 40, 70, 24);
        
        // Angle text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${Math.round(angleDiff)}°`, startX + 10, startY - 22);
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
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      if (drawing.segments.length === 0) {
        ctx.fillText('Click anywhere to start your first line', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      } else {
        ctx.fillText('Click an endpoint to continue, or anywhere to start new line', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      }
      ctx.textAlign = 'left';
      
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
        // Highlight hem open end (where the closed U meets the segment) so user can attach lines there
        const hemOpen = getHemOpenEndPoint(seg);
        if (hemOpen) {
          ctx.fillStyle = '#059669'; // Slightly different green for hem open end
          ctx.beginPath();
          ctx.arc(hemOpen.x * scale, hemOpen.y * scale, 8, 0, Math.PI * 2);
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
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Draw hem if exists (U-shaped fold - no exposed edge)
      if (segment.hasHem) {
        drawHem(ctx, segment, scale, false);
        
        // Draw 180° angle for hem at the corner where hem starts
        const hemPoint = segment.hemAtStart ? segment.start : segment.end;
        const hemX = hemPoint.x * scale;
        const hemY = hemPoint.y * scale;
        
        // Position the 180° label at the hem corner
        const side = segment.hemSide || 'right';
        const otherPoint = segment.hemAtStart ? segment.end : segment.start;
        const dx = otherPoint.x - hemPoint.x;
        const dy = otherPoint.y - hemPoint.y;
        const unitX = dx / Math.sqrt(dx * dx + dy * dy);
        const unitY = dy / Math.sqrt(dx * dx + dy * dy);
        
        const perpX = side === 'right' ? unitY : -unitY;
        const perpY = side === 'right' ? -unitX : unitX;
        
        // Position radially from corner
        const hemAngleX = hemX + perpX * 50;
        const hemAngleY = hemY + perpY * 50;
        
        ctx.fillStyle = '#6b21a8';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('180°', hemAngleX, hemAngleY);
        ctx.textAlign = 'left';
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
      const direction = dotProduct > 0 ? -1 : 1; // Flip if pointing toward centroid
      
      // Adjusted perpendicular (pointing away from shape)
      const outwardPerpX = perpX * direction;
      const outwardPerpY = perpY * direction;
      
      // STACKED LABELS: Label on top, measurement below
      // Use larger offset for short segments to avoid crowding
      const isShortSegment = lengthInInches < 1.0;
      const stackOffset = isShortSegment ? 50 : 35; // Distance from line
      const stackSpacing = 16; // Vertical spacing between label and measurement
      
      // Base position (perpendicular from midpoint)
      const baseX = midX + outwardPerpX * stackOffset;
      const baseY = midY + outwardPerpY * stackOffset;
      
      // Draw segment label (lighter gray, smaller, on top)
      ctx.fillStyle = '#999999';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(segment.label, baseX, baseY - 8);
      
      // Draw measurement (bold black, larger, below label)
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${cleanNumber(lengthInInches)}"`, baseX, baseY + 8);
      ctx.textAlign = 'left';

      // Draw angle label if not first segment - RADIALLY FROM CORNER AT 45° BISECTOR
      if (segmentIndex > 0) {
        const prevSegment = drawing.segments[segmentIndex - 1];
        const angle = calculateAngleBetweenSegments(prevSegment, segment);
        
        const useComplement = angleDisplayMode[segment.id] || false;
        const displayAngle = useComplement ? (360 - angle) : angle;
        
        // Calculate the two line directions
        const prevDx = prevSegment.end.x - prevSegment.start.x;
        const prevDy = prevSegment.end.y - prevSegment.start.y;
        const currDx = segment.end.x - segment.start.x;
        const currDy = segment.end.y - segment.start.y;
        
        const prevAngle = Math.atan2(prevDy, prevDx);
        const currAngle = Math.atan2(currDy, currDx);
        
        // Calculate the EXTERIOR bisector angle
        // The exterior bisector points away from the interior of the angle
        let bisectorAngle = (prevAngle + currAngle) / 2;
        
        // Determine if we need to add PI to point outward
        let angleDiff = currAngle - prevAngle;
        if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        
        // If the turn is to the left (counter-clockwise), the bisector should point outward by adding PI
        if (angleDiff > 0) {
          bisectorAngle += Math.PI;
        }
        
        // Position angle label RADIALLY from the corner point along the bisector
        // Use larger distance to keep angles clearly separated from measurements
        const angleDistance = 75; // Increased distance for better clarity
        const angleX = startX + Math.cos(bisectorAngle) * angleDistance;
        const angleY = startY + Math.sin(bisectorAngle) * angleDistance;
        
        // Draw angle text (no background box)
        ctx.fillStyle = '#6b21a8'; // Purple for angles
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(displayAngle)}°`, angleX, angleY);
        ctx.textAlign = 'left';
      }
    });



    // Draw hem previews if in preview mode
    if (hemPreviewMode) {
      const segment = drawing.segments.find(s => s.id === hemPreviewMode.segmentId);
      if (segment) {
        const segWithHem = { ...segment, hasHem: true, hemAtStart: hemPreviewMode.hemAtStart };
        drawHem(ctx, segWithHem, scale, true, 'left');
        drawHem(ctx, segWithHem, scale, true, 'right');
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
  }, [drawing, showDrawing, canvasReady, scale, gridSize, majorGridSize, CANVAS_WIDTH, CANVAS_HEIGHT, isDrawingMode, mousePos, drawingLocked, hemPreviewMode, angleDisplayMode]);

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

  function calculateAngleBetweenSegments(seg1: LineSegment, seg2: LineSegment): number {
    const dx1 = seg1.end.x - seg1.start.x;
    const dy1 = seg1.end.y - seg1.start.y;
    const dx2 = seg2.end.x - seg2.start.x;
    const dy2 = seg2.end.y - seg2.start.y;
    
    const angle1 = Math.atan2(dy1, dx1) * 180 / Math.PI;
    const angle2 = Math.atan2(dy2, dx2) * 180 / Math.PI;
    
    let diff = angle2 - angle1;
    if (diff < 0) diff += 360;
    if (diff > 360) diff -= 360;
    
    // Invert to show interior angle (90° for L-bends, not 270°)
    diff = 360 - diff;
    
    return diff;
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!canvasRef.current) return;
    
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

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    // Convert click from display pixels to canvas/inch coords (canvas may be CSS-scaled)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = ((e.clientX - rect.left) * scaleX) / scale;
    const clickY = ((e.clientY - rect.top) * scaleY) / scale;
    
    // Check if user clicked on an angle label to toggle it
    for (let i = 1; i < drawing.segments.length; i++) {
      const segment = drawing.segments[i];
      const prevSegment = drawing.segments[i - 1];
      
      const startX = segment.start.x * scale;
      const startY = segment.start.y * scale;
      
      const prevDx = prevSegment.end.x - prevSegment.start.x;
      const prevDy = prevSegment.end.y - prevSegment.start.y;
      const currDx = segment.end.x - segment.start.x;
      const currDy = segment.end.y - segment.start.y;
      
      const prevAngle = Math.atan2(prevDy, prevDx);
      const currAngle = Math.atan2(currDy, currDx);
      const bisectorAngle = (prevAngle + currAngle) / 2;
      
      const angleOffsetDist = 35;
      const angleX = startX + Math.cos(bisectorAngle) * angleOffsetDist;
      const angleY = startY + Math.sin(bisectorAngle) * angleOffsetDist;
      
      // Check if click is near the angle label (click in canvas pixels)
      const clickPixelX = (e.clientX - rect.left) * scaleX;
      const clickPixelY = (e.clientY - rect.top) * scaleY;
      const distToAngle = Math.sqrt(
        (clickPixelX - angleX) ** 2 + (clickPixelY - angleY) ** 2
      );
      
      if (distToAngle < 20) { // Within 20 pixels of angle label
        // Toggle angle display mode
        setAngleDisplayMode(prev => ({
          ...prev,
          [segment.id]: !prev[segment.id]
        }));
        toast.info('Angle view toggled');
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
    let snappedToEndpoint = false;
    let point: Point = { x: 0, y: 0 };
    
    if (!drawing.currentPoint) {
      // Check all segment connection points: start, end, and hem open end (where the U closes)
      const snapTolerance = 0.35; // inches - generous so open end of closed U is easy to hit
      for (const seg of drawing.segments) {
        const connectionPoints = getSegmentConnectionPoints(seg);
        for (const p of connectionPoints) {
          const dist = Math.sqrt((clickX - p.x) ** 2 + (clickY - p.y) ** 2);
          if (dist < snapTolerance) {
            point = { x: p.x, y: p.y };
            snappedToEndpoint = true;
            break;
          }
        }
        if (snappedToEndpoint) break;
      }
    }
    
    // If not snapped to endpoint, snap to grid
    if (!snappedToEndpoint) {
      const snappedX = Math.round(clickX / gridSize) * gridSize;
      const snappedY = Math.round(clickY / gridSize) * gridSize;
      point = { x: snappedX, y: snappedY };
    }
    
    if (!drawing.currentPoint) {
      // Start new line
      setDrawing(prev => ({ ...prev, currentPoint: point }));
      setLengthInput(''); // Clear length input when starting new line
      // Focus the length input after a short delay to allow state to update
      setTimeout(() => lengthInputRef.current?.focus(), 100);
    } else {
      // Complete line and STAY in drawing mode
      const newSegment: LineSegment = {
        id: Date.now().toString(),
        start: drawing.currentPoint,
        end: point,
        label: String.fromCharCode(drawing.nextLabel),
        hasHem: false,
        hemAtStart: false
      };
      
      setDrawing(prev => ({
        segments: [...prev.segments, newSegment],
        currentPoint: null, // Clear current point to allow starting next line
        selectedSegmentId: null,
        nextLabel: prev.nextLabel + 1
      }));
      
      setLengthInput(''); // Clear length input after completing line
      
      // STAY in drawing mode - user can continue adding lines
      toast.success('Line added - click endpoint to continue or anywhere to start new');
    }
  }

  function selectSegment(segmentId: string) {
    setDrawing(prev => ({ ...prev, selectedSegmentId: segmentId }));
  }

  function deleteSelectedSegment() {
    if (!drawing.selectedSegmentId) {
      toast.error('No segment selected');
      return;
    }
    
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
    
    // Calculate current angle
    const segmentIndex = drawing.segments.indexOf(segment);
    let angle = 0;
    if (segmentIndex > 0) {
      const prevSegment = drawing.segments[segmentIndex - 1];
      angle = calculateAngleBetweenSegments(prevSegment, segment);
    }
    
    setEditMode({
      segmentId,
      measurement: measurement.toFixed(3),
      angle: Math.round(angle).toString()
    });
  }

  function applyEdit() {
    if (!editMode) return;
    
    const newMeasurement = parseFloat(editMode.measurement);
    const newAngle = parseFloat(editMode.angle);
    
    if (isNaN(newMeasurement) || newMeasurement <= 0) {
      toast.error('Please enter a valid measurement');
      return;
    }
    
    const segmentIndex = drawing.segments.findIndex(s => s.id === editMode.segmentId);
    if (segmentIndex === -1) return;
    
    const segment = drawing.segments[segmentIndex];
    
    // Calculate new endpoint based on measurement and angle
    let angleRadians: number;
    
    if (segmentIndex === 0) {
      // First segment - use angle from horizontal
      angleRadians = (newAngle * Math.PI) / 180;
      const newEndX = segment.start.x + newMeasurement * Math.cos(angleRadians);
      const newEndY = segment.start.y + newMeasurement * Math.sin(angleRadians);
      
      // Snap to grid
      const snappedEndX = Math.round(newEndX / gridSize) * gridSize;
      const snappedEndY = Math.round(newEndY / gridSize) * gridSize;
      
      const updatedSegments = [...drawing.segments];
      updatedSegments[segmentIndex] = {
        ...segment,
        end: { x: snappedEndX, y: snappedEndY }
      };
      
      setDrawing(prev => ({ ...prev, segments: updatedSegments }));
    } else {
      // Not first segment - calculate based on previous segment's angle
      const prevSegment = drawing.segments[segmentIndex - 1];
      const prevDx = prevSegment.end.x - prevSegment.start.x;
      const prevDy = prevSegment.end.y - prevSegment.start.y;
      const prevAngle = Math.atan2(prevDy, prevDx);
      
      angleRadians = prevAngle + (newAngle * Math.PI / 180);
      
      const newEndX = segment.start.x + newMeasurement * Math.cos(angleRadians);
      const newEndY = segment.start.y + newMeasurement * Math.sin(angleRadians);
      
      // Snap to grid
      const snappedEndX = Math.round(newEndX / gridSize) * gridSize;
      const snappedEndY = Math.round(newEndY / gridSize) * gridSize;
      
      const updatedSegments = [...drawing.segments];
      updatedSegments[segmentIndex] = {
        ...segment,
        end: { x: snappedEndX, y: snappedEndY }
      };
      
      setDrawing(prev => ({ ...prev, segments: updatedSegments }));
    }
    
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
      const targetLength = parseFloat(lengthInput);
      
      if (isNaN(targetLength) || targetLength <= 0) {
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
      
      setDrawing(prev => ({
        segments: [...prev.segments, newSegment],
        currentPoint: null,
        selectedSegmentId: null,
        nextLabel: prev.nextLabel + 1
      }));
      
      setLengthInput('');
      toast.success(`Line created: ${cleanNumber(targetLength)}"`);
    }
  }

  function startHemPreview() {
    const segmentId = drawing.selectedSegmentId || drawing.segments[drawing.segments.length - 1]?.id;
    
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
            ? { ...seg, hasHem: false, hemAtStart: false, hemSide: undefined }
            : seg
        )
      }));
      toast.success('Hem removed');
      return;
    }
    
    // Auto-select this segment so user sees which one gets the hem
    setDrawing(prev => ({ ...prev, selectedSegmentId: segmentId }));
    setHemPreviewMode({ segmentId, hemAtStart: false });
    toast.info('Choose which end, then LEFT or RIGHT for the 1/2" U hem');
  }

  function addHemToSide(side: 'left' | 'right') {
    if (!hemPreviewMode) return;
    
    setDrawing(prev => ({
      ...prev,
      segments: prev.segments.map(seg => 
        seg.id === hemPreviewMode.segmentId
          ? { ...seg, hasHem: true, hemAtStart: hemPreviewMode.hemAtStart, hemSide: side }
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
    
    setDrawing({
      segments: [],
      selectedSegmentId: null,
      currentPoint: null,
      nextLabel: 65
    });
  }

  function calculateTotalLength() {
    let total = 0;
    
    drawing.segments.forEach(segment => {
      const dx = segment.end.x - segment.start.x;
      const dy = segment.end.y - segment.start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      total += length;
      
      // Add hem length - true 1/2" U-shaped hem adds to material take-off
      // Hem includes: 0.5" out + 180° bend + 0.5" back = 0.5" to total girth
      if (segment.hasHem) {
        total += 0.5; // Hem adds exactly 0.5" to total material needed
      }
    });
    
    return total;
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
    setInchInputs([{ id: '1', value: totalLength.toFixed(2) }]);
    setNumberOfBends(bends.toString());
    
    toast.success(`Applied: ${cleanNumber(totalLength, 2)}" with ${bends} bends`);
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
      const { data, error } = await supabase
        .from('jobs')
        .select('id, name, job_number')
        .eq('status', 'active')
        .order('name');
      
      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error('Error loading jobs:', error);
    }
  }
  
  async function loadTrimTypes() {
    try {
      console.log('🔄 Loading trim types from database...');
      const { data, error } = await supabase
        .from('trim_types')
        .select('*')
        .eq('active', true)
        .order('name');
      
      if (error) {
        console.error('❌ Error loading trim types:', error);
        toast.error('Failed to load trim types. Please check permissions.');
        throw error;
      }
      
      console.log('✅ Loaded trim types:', data);
      console.log('📊 Total trim types found:', data?.length || 0);
      setTrimTypes(data || []);
      
      // Auto-select first type if none selected
      if (data && data.length > 0 && !selectedTrimTypeId) {
        setSelectedTrimTypeId(data[0].id);
        console.log('✅ Auto-selected first trim type:', data[0].name);
      }
    } catch (error: any) {
      console.error('❌ Error loading trim types:', error);
      toast.error(`Failed to load trim types: ${error.message || 'Unknown error'}`);
    }
  }

  async function loadSavedConfigs(silent = false) {
    try {
      console.log('🔄 Loading saved trim configurations from database...');
      console.log('Current user:', await supabase.auth.getUser());
      
      const { data, error } = await supabase
        .from('trim_saved_configs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ Error loading saved configs:', error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        toast.error(`Failed to load saved configurations: ${error.message}`);
        throw error;
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
      if (!silent) {
        toast.success(`Loaded ${data?.length || 0} saved trim configurations`);
      }
    } catch (error: any) {
      console.error('❌ Unexpected error loading saved configs:', error);
      toast.error(`Error: ${error.message || 'Unknown error'}`);
    }
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
        const { error } = await supabase
          .from('trim_types')
          .update({
            name: newTrimTypeName.trim(),
            width_inches: width,
            cost_per_lf: cost,
            price_per_bend: bendPrice,
            markup_percent: markup,
            cut_price: cutPrice,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingTrimType.id);
        
        if (error) throw error;
        toast.success('Material type updated');
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('trim_types')
          .insert([{
            name: newTrimTypeName.trim(),
            width_inches: width,
            cost_per_lf: cost,
            price_per_bend: bendPrice,
            markup_percent: markup,
            cut_price: cutPrice,
            active: true
          }])
          .select()
          .single();
        
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
      toast.error('Failed to save material type');
    }
  }
  
  async function deleteTrimType(id: string) {
    if (!confirm('Delete this trim type?')) return;
    
    try {
      const { error } = await supabase
        .from('trim_types')
        .update({ active: false })
        .eq('id', id);
      
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
      };

      console.log('💾 Saving config data:', configData);
      console.log('📍 Current user session:', await supabase.auth.getSession());
      
      const { data: insertedData, error } = await supabase
        .from('trim_saved_configs')
        .insert([configData])
        .select();

      if (error) {
        console.error('❌ Insert error:', error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }
      
      console.log('✅ Successfully inserted config:', insertedData);
      console.log('📊 Total configs now:', (savedConfigs.length + 1));
      
      toast.success('Configuration saved successfully');
      setShowSaveDialog(false);
      setConfigName('');
      setSelectedJobId('');
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
    
    // Parse and load drawing if it exists
    let drawingSegments: LineSegment[] | null = null;
    try {
      if (config.drawing_segments) {
        const raw = typeof config.drawing_segments === 'string'
          ? JSON.parse(config.drawing_segments)
          : config.drawing_segments;
        const arr = Array.isArray(raw) ? raw : null;
        if (arr && arr.length > 0) {
          // Normalize segments so canvas has required fields (id, start, end, label, hasHem, hemAtStart, hemSide)
          drawingSegments = arr.map((seg: any, index: number) => ({
            id: seg.id ?? `seg-${index}-${Date.now()}`,
            start: seg.start && typeof seg.start.x === 'number' && typeof seg.start.y === 'number'
              ? { x: seg.start.x, y: seg.start.y }
              : { x: 0, y: 0 },
            end: seg.end && typeof seg.end.x === 'number' && typeof seg.end.y === 'number'
              ? { x: seg.end.x, y: seg.end.y }
              : { x: 0, y: 0 },
            label: seg.label ?? String.fromCharCode(65 + index),
            hasHem: seg.hasHem === true,
            hemAtStart: seg.hemAtStart === true,
            hemSide: seg.hemSide === 'left' || seg.hemSide === 'right' ? seg.hemSide : 'right',
          }));
        }
      }
    } catch (e) {
      console.warn('Could not parse drawing_segments for config', config.name, e);
    }

    if (drawingSegments && drawingSegments.length > 0) {
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
    <div className="grid grid-cols-[1.6fr,1fr] gap-3 max-w-full mx-auto h-[calc(100vh-80px)] overflow-hidden p-2">
      {/* Drawing Tool - Left Side */}
      <Card className="border-4 border-yellow-500 bg-gradient-to-br from-green-950 via-black to-green-900 shadow-2xl flex flex-col h-full overflow-hidden">
        <CardHeader className="pb-2 border-b-2 border-yellow-500 py-2">
          <CardTitle className="flex items-center gap-2 text-yellow-500">
            <Pencil className="w-5 h-5" />
            <span className="text-lg font-bold">2D Drawing Tool</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 flex-1 flex flex-col overflow-hidden">
          <div className="relative border-4 border-gray-300 rounded overflow-hidden shadow-2xl bg-white h-full">
            {!canvasReady ? (
              <div className="w-full h-full flex items-center justify-center bg-gray-100">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-gray-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-700 font-semibold">Loading Canvas...</p>
                </div>
              </div>
            ) : (
              <div className="overflow-auto h-full">
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  onClick={handleCanvasClick}
                  onMouseMove={handleCanvasMouseMove}
                  className="cursor-crosshair"
                  style={{ display: 'block' }}
                />
              </div>
            )}
            
            {/* Top Controls - Overlaid on Canvas */}
            <div className="absolute top-2 left-2 right-2 flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur-sm p-2 rounded-lg border-2 border-gray-300 shadow-lg text-xs">
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
                  <div className="flex items-center gap-2 px-2 py-1 bg-green-100 border-2 border-green-500 rounded">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-green-700 font-bold text-xs">
                      {drawing.currentPoint ? 'Click to finish line' : 'Click endpoint or anywhere to start'}
                    </span>
                  </div>
                  
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
                onClick={clearDrawing}
                size="sm"
                variant="outline"
                className="h-7 px-2 border border-red-500 text-red-600 hover:bg-red-50 text-xs"
              >
                <Trash className="w-3 h-3 mr-1" />
                Clear
              </Button>
              
              {/* Add Hem Button - Available when segment selected or last segment exists */}
              {!hemPreviewMode && (drawing.selectedSegmentId || drawing.segments.length > 0) && (
                <Button
                  onClick={startHemPreview}
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
              {hemPreviewMode && (
                <>
                  <div className="flex items-center gap-2 px-2 py-1 bg-purple-100 border-2 border-purple-500 rounded">
                    <span className="text-purple-700 font-bold text-xs">1/2&quot; U Hem — choose end, then side:</span>
                  </div>
                  <Button
                    onClick={() => setHemPreviewEnd(false)}
                    size="sm"
                    variant="outline"
                    className={`h-7 px-2 text-xs ${!hemPreviewMode.hemAtStart ? 'border-purple-600 bg-purple-100 text-purple-800 font-bold' : 'border-gray-400 text-gray-600 hover:bg-gray-100'}`}
                  >
                    At end
                  </Button>
                  <Button
                    onClick={() => setHemPreviewEnd(true)}
                    size="sm"
                    variant="outline"
                    className={`h-7 px-2 text-xs ${hemPreviewMode.hemAtStart ? 'border-purple-600 bg-purple-100 text-purple-800 font-bold' : 'border-gray-400 text-gray-600 hover:bg-gray-100'}`}
                  >
                    At start
                  </Button>
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
              )}
              
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
              <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-sm border-2 border-gray-300 rounded-lg p-2 shadow-lg max-w-xs">
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
                        <span>{seg.label} {seg.hasHem && `(HEM-${seg.hemSide?.toUpperCase()})`}</span>
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

            {/* Live Drawing Info - Bottom Right (Minimal Black & White) - Only when actively drawing */}
            {isDrawingMode && drawing.currentPoint && mousePos && (
              <div className="absolute bottom-14 right-2 bg-white/95 backdrop-blur-sm border border-gray-300 rounded p-2 shadow-md">
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
                          <span className="text-gray-800 font-semibold">{cleanNumber(length)}"</span>
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
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
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
                  <Button
                    onClick={() => setSelectedJobId('')}
                    variant="outline"
                    size="sm"
                    className="w-full border-red-500 text-red-400 hover:bg-red-900/20"
                  >
                    Clear Job Selection
                  </Button>
                )}
              </div>
            </div>
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
              <div className="space-y-2">
                {savedConfigs.map((config) => {
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
                          <div className="w-24 h-24 shrink-0 bg-white rounded border-2 border-green-700">
                            <svg viewBox="0 0 100 100" className="w-full h-full">
                              {(() => {
                                const allX = config.drawing_segments!.flatMap(s => [s.start.x, s.end.x]);
                                const allY = config.drawing_segments!.flatMap(s => [s.start.y, s.end.y]);
                                const minX = Math.min(...allX);
                                const maxX = Math.max(...allX);
                                const minY = Math.min(...allY);
                                const maxY = Math.max(...allY);
                                const width = maxX - minX;
                                const height = maxY - minY;
                                const padding = Math.max(width, height) * 0.1;
                                const viewBoxWidth = width + 2 * padding;
                                const viewBoxHeight = height + 2 * padding;
                                const scaleX = 100 / viewBoxWidth;
                                const scaleY = 100 / viewBoxHeight;
                                const scale = Math.min(scaleX, scaleY);
                                const offsetX = (100 - width * scale) / 2 - minX * scale;
                                const offsetY = (100 - height * scale) / 2 - minY * scale;
                                return (
                                  <g transform={`translate(${offsetX}, ${offsetY}) scale(${scale})`}>
                                    {config.drawing_segments!.map((seg, i) => (
                                      <line key={i} x1={seg.start.x} y1={seg.start.y} x2={seg.end.x} y2={seg.end.y} stroke="#000000" strokeWidth={0.5 / scale} />
                                    ))}
                                  </g>
                                );
                              })()}
                            </svg>
                          </div>
                        )}

                        {/* Info: title with bends & price close, then rest */}
                        <div className="flex-1 min-w-0">
                          <div className="text-yellow-400 font-bold text-lg">{config.name}</div>
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

      {/* Price List Dialog */}
      <Dialog open={showPriceList} onOpenChange={setShowPriceList}>
        <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500">
              <Calculator className="w-5 h-5" />
              Trim Price List
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
              
              // Calculate prices for all configs using selected material
              const pricedConfigs = savedConfigs.map(config => {
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
                  sellingPrice
                };
              }).filter(Boolean);
              
              return (
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
                            <td colSpan={9} className="text-center py-8 text-white/50">
                              No valid trim configurations found
                            </td>
                          </tr>
                        ) : (
                          pricedConfigs.map((item: any) => (
                            <tr key={item.config.id} className="border-b border-green-800/30 hover:bg-green-900/20">
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
                                <div className="flex items-center justify-center gap-1">
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
