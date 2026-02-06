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
}

export function TrimPricingCalculator() {
  // Persistent settings
  const [sheetLFCost, setSheetLFCost] = useState<string>('3.46');
  const [pricePerBend, setPricePerBend] = useState<string>('1.00');
  const [markupPercent, setMarkupPercent] = useState<string>('35');
  const [cutPrice, setCutPrice] = useState<string>('1.00');
  
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
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  
  const [tempLFCost, setTempLFCost] = useState('3.46');
  const [tempBendPrice, setTempBendPrice] = useState('1.00');
  const [tempMarkupPercent, setTempMarkupPercent] = useState('35');
  const [tempCutPrice, setTempCutPrice] = useState('1.00');

  // Save/Load
  const [configName, setConfigName] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [jobs, setJobs] = useState<any[]>([]);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [saving, setSaving] = useState(false);

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
    
    // Determine which side to use
    const side = isPreview ? previewSide : segment.hemSide || 'right';
    const perpX = side === 'right' ? perpRightX : perpLeftX;
    const perpY = side === 'right' ? perpRightY : perpLeftY;
    
    // Hem dimensions
    const hemDepth = 0.5; // 1/2" hem depth
    const steelThickness = 0.0625; // 1/16" steel thickness offset
    const bendRadius = 0.125; // 1/8" rounded bend radius for smooth U-shape
    
    // Create true U-shaped hem with smooth 180-degree return bend:
    // 1. Go perpendicular out from endpoint by (hem depth - bend radius)
    // 2. Add smooth 180-degree arc
    // 3. Return parallel, offset by steel thickness
    
    // P1: Starting point (endpoint of segment) - outer edge
    const p1x = hemPoint.x * scale;
    const p1y = hemPoint.y * scale;
    
    // P2: End of outward perpendicular leg (before bend starts)
    const outwardLength = hemDepth - bendRadius;
    const p2x = (hemPoint.x + perpX * outwardLength) * scale;
    const p2y = (hemPoint.y + perpY * outwardLength) * scale;
    
    // Bend center point for smooth 180-degree arc
    const bendCenterX = (hemPoint.x + perpX * hemDepth) * scale;
    const bendCenterY = (hemPoint.y + perpY * hemDepth) * scale;
    
    // P3: Start of return leg (after bend) - offset by steel thickness
    const inwardLength = hemDepth - bendRadius - steelThickness;
    const p3x = (hemPoint.x + perpX * inwardLength) * scale;
    const p3y = (hemPoint.y + perpY * inwardLength) * scale;
    
    // P4: End of return leg - back near segment, offset by steel thickness
    const p4x = (hemPoint.x + perpX * steelThickness) * scale;
    const p4y = (hemPoint.y + perpY * steelThickness) * scale;
    
    // Drawing style
    if (isPreview) {
      ctx.strokeStyle = '#9333ea'; // Purple outline
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.fillStyle = 'rgba(147, 51, 234, 0.2)'; // Purple preview fill
    } else {
      ctx.strokeStyle = '#dc2626'; // Red outline
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(220, 38, 38, 0.15)'; // Light red fill
    }
    
    // Calculate angle for the arc
    const startAngle = Math.atan2(perpY, perpX);
    const endAngle = startAngle + Math.PI;
    
    // Draw outer hem leg (going out)
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    
    // Draw smooth 180-degree outer arc
    ctx.arc(
      bendCenterX,
      bendCenterY,
      bendRadius * scale,
      startAngle - Math.PI / 2,
      endAngle - Math.PI / 2,
      false
    );
    
    // Connect to return leg
    ctx.lineTo(p4x, p4y);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw inner return leg (showing doubled-back metal) - slightly thinner
    ctx.lineWidth = isPreview ? 1.5 : 2;
    ctx.strokeStyle = isPreview ? 'rgba(147, 51, 234, 0.6)' : 'rgba(220, 38, 38, 0.6)';
    
    const innerBendRadius = bendRadius - steelThickness;
    ctx.beginPath();
    ctx.moveTo(p4x, p4y);
    ctx.lineTo(p3x, p3y);
    
    // Draw inner arc (showing the inside of the fold)
    if (innerBendRadius > 0) {
      const innerCenterX = (hemPoint.x + perpX * (hemDepth - steelThickness)) * scale;
      const innerCenterY = (hemPoint.y + perpY * (hemDepth - steelThickness)) * scale;
      ctx.arc(
        innerCenterX,
        innerCenterY,
        innerBendRadius * scale,
        startAngle - Math.PI / 2,
        endAngle - Math.PI / 2,
        false
      );
    }
    ctx.stroke();
    
    // Reset stroke style
    ctx.strokeStyle = isPreview ? '#9333ea' : '#dc2626';
    ctx.lineWidth = isPreview ? 2 : 3;
    
    // Fill the hem area to show it's folded material
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.arc(
      bendCenterX,
      bendCenterY,
      bendRadius * scale,
      startAngle,
      startAngle + Math.PI,
      false
    );
    ctx.lineTo(p4x, p4y);
    ctx.closePath();
    ctx.fill();
    
    // Draw label
    if (isPreview) {
      ctx.fillStyle = '#9333ea';
      ctx.font = 'bold 14px sans-serif';
      const labelX = (p1x + p2x) / 2 + perpX * 10 * scale;
      const labelY = (p1y + p2y) / 2 + perpY * 10 * scale;
      ctx.fillText(`${side.toUpperCase()}?`, labelX - 20, labelY + 5);
    } else {
      ctx.fillStyle = '#dc2626';
      ctx.font = 'bold 12px sans-serif';
      const labelX = (p1x + p2x) / 2 + perpX * 10 * scale;
      const labelY = (p1y + p2y) / 2 + perpY * 10 * scale;
      ctx.fillText('HEM', labelX - 15, labelY + 4);
      
      // Add measurement annotation
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
      
      // Highlight all endpoints when in drawing mode
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
      });
    }

    // Draw segments
    drawing.segments.forEach(segment => {
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
        
        const perpX = side === 'right' ? -unitY : unitY;
        const perpY = side === 'right' ? unitX : -unitX;
        
        const hemAngleX = hemX + perpX * 35;
        const hemAngleY = hemY + perpY * 35;
        
        ctx.fillStyle = '#6b21a8';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('180°', hemAngleX, hemAngleY);
        ctx.textAlign = 'left';
      }

      // Calculate measurements first
      const dx = segment.end.x - segment.start.x;
      const dy = segment.end.y - segment.start.y;
      const lengthInInches = Math.sqrt(dx * dx + dy * dy);
      
      // Calculate line angle for positioning text
      const lineAngle = Math.atan2(dy, dx);
      const isVerticalish = Math.abs(Math.cos(lineAngle)) < 0.5; // More vertical than horizontal
      
      // Mid point
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      
      // Calculate perpendicular offset direction for better spacing
      const perpX = -dy / Math.sqrt(dx * dx + dy * dy) || 0;
      const perpY = dx / Math.sqrt(dx * dx + dy * dy) || 0;
      
      // Intelligent spacing - check if we need to offset this measurement
      const segmentIndex = drawing.segments.indexOf(segment);
      let needsArrow = false;
      let measureOffset = 40;
      
      // Check if this segment's measurement would overlap with adjacent segments
      if (segmentIndex > 0 || segmentIndex < drawing.segments.length - 1) {
        // For short segments or when segments are close, use arrow offset
        if (lengthInInches < 2) {
          needsArrow = true;
          measureOffset = 60; // Move further away
        }
      }
      
      const labelOffset = 25;
      
      // Draw label (letter) - light gray, smaller, on OUTSIDE of trim
      ctx.fillStyle = '#999999';
      ctx.font = '13px sans-serif';
      const labelX = midX - perpX * (labelOffset + 10);
      const labelY = midY - perpY * (labelOffset + 10);
      ctx.fillText(segment.label, labelX - 5, labelY + 4);

      // Draw measurement with optional arrow - on OUTSIDE of trim
      const measureX = midX - perpX * (measureOffset + 20);
      const measureY = midY - perpY * (measureOffset + 20);
      
      if (needsArrow) {
        // Draw arrow from measurement to line midpoint
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(measureX, measureY - 8);
        ctx.lineTo(midX, midY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw arrowhead
        const arrowAngle = Math.atan2(midY - (measureY - 8), midX - measureX);
        const arrowSize = 6;
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(
          midX - arrowSize * Math.cos(arrowAngle - Math.PI / 6),
          midY - arrowSize * Math.sin(arrowAngle - Math.PI / 6)
        );
        ctx.lineTo(
          midX - arrowSize * Math.cos(arrowAngle + Math.PI / 6),
          midY - arrowSize * Math.sin(arrowAngle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = '#666666';
        ctx.fill();
      }
      
      // Draw measurement - dominant, bold, larger, no trailing zeros
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${cleanNumber(lengthInInches)}"`, measureX, measureY);
      ctx.textAlign = 'left';

      // Calculate and draw angle EXACTLY AT THE CORNER (if not first segment)
      if (segmentIndex > 0) {
        const prevSegment = drawing.segments[segmentIndex - 1];
        const angle = calculateAngleBetweenSegments(prevSegment, segment);
        
        // Allow toggling between angle and its complement
        const useComplement = angleDisplayMode[segment.id] || false;
        const displayAngle = useComplement ? (360 - angle) : angle;
        
        // Position angle EXACTLY at the corner point (where segments meet)
        const prevDx = prevSegment.end.x - prevSegment.start.x;
        const prevDy = prevSegment.end.y - prevSegment.start.y;
        const currDx = segment.end.x - segment.start.x;
        const currDy = segment.end.y - segment.start.y;
        
        // Calculate the angle bisector for optimal placement
        const prevAngle = Math.atan2(prevDy, prevDx);
        const currAngle = Math.atan2(currDy, currDx);
        
        // Calculate the exterior angle bisector (45° from corner)
        let bisectorAngle = (prevAngle + currAngle) / 2;
        
        // Point outward from the shape
        const angleDiff = currAngle - prevAngle;
        if (Math.abs(angleDiff) > Math.PI) {
          bisectorAngle += Math.PI;
        } else {
          bisectorAngle += Math.PI; // Flip to point outward
        }
        
        // Position angle label further away from corner at 45° angle
        const angleOffsetDist = 40; // Further from corner
        const angleX = startX + Math.cos(bisectorAngle) * angleOffsetDist;
        const angleY = startY + Math.sin(bisectorAngle) * angleOffsetDist;
        
        // Draw angle text at the corner
        ctx.fillStyle = '#6b21a8';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(displayAngle)}°`, angleX, angleY + 4);
        ctx.textAlign = 'left';
      }
    });

    // Draw hem previews if in preview mode
    if (hemPreviewMode) {
      const segment = drawing.segments.find(s => s.id === hemPreviewMode.segmentId);
      if (segment) {
        // Draw preview on both sides
        drawHem(ctx, { ...segment, hasHem: true, hemAtStart: false }, scale, true, 'left');
        drawHem(ctx, { ...segment, hasHem: true, hemAtStart: false }, scale, true, 'right');
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
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    
    // Snap to grid
    const snappedX = Math.round(x / gridSize) * gridSize;
    const snappedY = Math.round(y / gridSize) * gridSize;
    
    setMousePos({ x: snappedX, y: snappedY });
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / scale;
    const clickY = (e.clientY - rect.top) / scale;
    
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
      
      // Check if click is near the angle label
      const distToAngle = Math.sqrt(
        ((e.clientX - rect.left) - angleX) ** 2 + 
        ((e.clientY - rect.top) - angleY) ** 2
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
      // Check all segment endpoints for snapping
      for (const seg of drawing.segments) {
        // Check start point
        const distToStart = Math.sqrt(
          (clickX - seg.start.x) ** 2 + (clickY - seg.start.y) ** 2
        );
        if (distToStart < 0.25) { // Within 0.25" snap to endpoint
          point = { x: seg.start.x, y: seg.start.y };
          snappedToEndpoint = true;
          break;
        }
        
        // Check end point
        const distToEnd = Math.sqrt(
          (clickX - seg.end.x) ** 2 + (clickY - seg.end.y) ** 2
        );
        if (distToEnd < 0.25) { // Within 0.25" snap to endpoint
          point = { x: seg.end.x, y: seg.end.y };
          snappedToEndpoint = true;
          break;
        }
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
      toast.error('No segment available for hem');
      return;
    }
    
    const segment = drawing.segments.find(s => s.id === segmentId);
    if (segment?.hasHem) {
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
    
    setHemPreviewMode({ segmentId });
    toast.info('Click on LEFT or RIGHT preview to choose hem side');
  }

  function addHemToSide(side: 'left' | 'right') {
    if (!hemPreviewMode) return;
    
    setDrawing(prev => ({
      ...prev,
      segments: prev.segments.map(seg => 
        seg.id === hemPreviewMode.segmentId
          ? { ...seg, hasHem: true, hemAtStart: false, hemSide: side }
          : seg
      )
    }));
    setHemPreviewMode(null);
    toast.success(`Hem added to ${side} side`);
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
    loadSettings();
    loadJobs();
    loadSavedConfigs();
  }, []);

  async function loadSettings() {
    try {
      console.log('🔄 Loading trim calculator settings from database...');
      
      const { data, error } = await supabase
        .from('trim_calculator_settings')
        .select('*')
        .order('updated_at', { ascending: false});
      
      if (error) {
        console.error('❌ Error loading settings:', error);
      }
      
      if (data && data.length > 0) {
        // Settings found in database - use the most recent one
        const mostRecent = data[0];
        
        // Convert to strings, handling 0 values and nulls properly
        const lfCost = mostRecent.sheet_lf_cost != null ? String(mostRecent.sheet_lf_cost) : '3.46';
        const bendPrice = mostRecent.price_per_bend != null ? String(mostRecent.price_per_bend) : '1.00';
        const markup = mostRecent.markup_percent != null ? String(mostRecent.markup_percent) : '35';
        const cut = mostRecent.cut_price != null ? String(mostRecent.cut_price) : '1.00';
        
        console.log('✅ Loaded settings from database:', { lfCost, bendPrice, markup, cut });
        
        // Set both main state and temp state
        setSheetLFCost(lfCost);
        setTempLFCost(lfCost);
        setPricePerBend(bendPrice);
        setTempBendPrice(bendPrice);
        setMarkupPercent(markup);
        setTempMarkupPercent(markup);
        setCutPrice(cut);
        setTempCutPrice(cut);
      } else {
        // No settings in database yet - create initial defaults and save them
        console.log('ℹ️ No settings found in database, creating defaults...');
        const defaultLFCost = '3.46';
        const defaultBendPrice = '1.00';
        const defaultMarkup = '35';
        const defaultCut = '1.00';
        
        // Set state first
        setSheetLFCost(defaultLFCost);
        setTempLFCost(defaultLFCost);
        setPricePerBend(defaultBendPrice);
        setTempBendPrice(defaultBendPrice);
        setMarkupPercent(defaultMarkup);
        setTempMarkupPercent(defaultMarkup);
        setCutPrice(defaultCut);
        setTempCutPrice(defaultCut);
        
        // Save defaults to database so they persist
        try {
          const settingsData = {
            sheet_lf_cost: parseFloat(defaultLFCost),
            price_per_bend: parseFloat(defaultBendPrice),
            markup_percent: parseFloat(defaultMarkup),
            cut_price: parseFloat(defaultCut),
            updated_at: new Date().toISOString()
          };
          
          const { error: insertError } = await supabase
            .from('trim_calculator_settings')
            .insert([settingsData]);
          
          if (insertError) {
            console.error('❌ Error saving default settings:', insertError);
          } else {
            console.log('✅ Default settings saved to database');
          }
        } catch (err) {
          console.error('❌ Exception saving default settings:', err);
        }
      }
    } catch (error) {
      console.error('❌ Exception loading settings:', error);
      // Use defaults on exception
      const defaultLFCost = '3.46';
      const defaultBendPrice = '1.00';
      const defaultMarkup = '35';
      const defaultCut = '1.00';
      
      setSheetLFCost(defaultLFCost);
      setTempLFCost(defaultLFCost);
      setPricePerBend(defaultBendPrice);
      setTempBendPrice(defaultBendPrice);
      setMarkupPercent(defaultMarkup);
      setTempMarkupPercent(defaultMarkup);
      setCutPrice(defaultCut);
      setTempCutPrice(defaultCut);
    }
  }

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

  async function loadSavedConfigs() {
    try {
      // Load from localStorage for now (could be database table later)
      const saved = localStorage.getItem('trim_saved_configs');
      if (saved) {
        setSavedConfigs(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Error loading saved configs:', error);
    }
  }

  async function saveSettings() {
    const lfCost = parseFloat(tempLFCost);
    const bendPrice = parseFloat(tempBendPrice);
    const markup = parseFloat(tempMarkupPercent);
    const cut = parseFloat(tempCutPrice);
    
    if (!lfCost || lfCost <= 0) {
      toast.error('Please enter a valid sheet cost per LF');
      return;
    }
    if (!bendPrice || bendPrice <= 0) {
      toast.error('Please enter a valid price per bend');
      return;
    }
    if (markup < 0) {
      toast.error('Please enter a valid markup percentage (0 or higher)');
      return;
    }
    if (!cut || cut <= 0) {
      toast.error('Please enter a valid cut price');
      return;
    }
    
    try {
      console.log('💾 Saving trim calculator settings...');
      
      // Check if settings exist - get all and use the first one
      const { data: existingList, error: checkError } = await supabase
        .from('trim_calculator_settings')
        .select('id')
        .order('updated_at', { ascending: false });
      
      if (checkError) {
        console.error('❌ Error checking existing settings:', checkError);
      }
      
      const settingsData = {
        sheet_lf_cost: lfCost,
        price_per_bend: bendPrice,
        markup_percent: markup,
        cut_price: cut,
        updated_at: new Date().toISOString()
      };
      
      console.log('📝 Settings data to save:', settingsData);
      
      let error;
      let savedData;
      
      if (existingList && existingList.length > 0) {
        // Update the most recent settings (or update all to keep them in sync)
        const existingId = existingList[0].id;
        console.log('🔄 Updating existing settings with ID:', existingId);
        
        // Update the most recent one
        const result = await supabase
          .from('trim_calculator_settings')
          .update(settingsData)
          .eq('id', existingId)
          .select();
        
        error = result.error;
        savedData = result.data?.[0]; // Get first item from array
        
        // Optional: Delete old duplicate entries to keep table clean
        if (existingList.length > 1) {
          console.log('🧹 Cleaning up old duplicate settings...');
          const oldIds = existingList.slice(1).map(item => item.id);
          await supabase
            .from('trim_calculator_settings')
            .delete()
            .in('id', oldIds);
        }
      } else {
        // Insert new settings
        console.log('➕ Inserting new settings');
        const result = await supabase
          .from('trim_calculator_settings')
          .insert([settingsData])
          .select();
        
        error = result.error;
        savedData = result.data?.[0]; // Get first item from array
      }
      
      if (error) {
        console.error('❌ Error saving to database:', error);
        throw error;
      }
      
      console.log('✅ Settings saved successfully to database:', savedData);
      
      // Update component state with the saved values (keep as strings)
      setSheetLFCost(tempLFCost);
      setPricePerBend(tempBendPrice);
      setMarkupPercent(tempMarkupPercent);
      setCutPrice(tempCutPrice);
      
      console.log('✅ State updated - settings will persist when dialog reopens');
      
      setShowSettings(false);
      toast.success('Settings saved and will persist!');
    } catch (error) {
      console.error('❌ Exception saving settings:', error);
      toast.error('Failed to save settings: ' + (error as any).message);
    }
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
    const lfCost = parseFloat(sheetLFCost);
    const bendPriceVal = parseFloat(pricePerBend);
    const markup = parseFloat(markupPercent);
    const cutPriceVal = parseFloat(cutPrice);
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
    // 1. LF cost is for a 42" wide piece that is 10' long
    // 2. Multiply by 10 to get cost for the full 10' sheet
    const sheetCost = lfCost * 10;
    
    // 3. Calculate cost per inch BEFORE markup (material cost)
    const costPerInchBeforeMarkup = sheetCost / 42;
    
    // 4. Material cost for this piece (before markup)
    const materialCostValue = totalIn * costPerInchBeforeMarkup;
    setMaterialCost(materialCostValue);
    
    // 5. Apply markup percentage
    const markupMultiplier = 1 + (markup / 100);
    const markedUpSheetCost = sheetCost * markupMultiplier;
    
    // 6. Divide by 42 to get price per inch for a 10' strip (after markup)
    const pricePerInch = markedUpSheetCost / 42;
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
  }, [sheetLFCost, pricePerBend, markupPercent, cutPrice, inchInputs, numberOfBends]);

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

    try {
      setSaving(true);
      
      const jobName = selectedJobId 
        ? jobs.find(j => j.id === selectedJobId)?.name || null
        : null;

      const newConfig: SavedConfig = {
        id: Date.now().toString(),
        name: configName.trim(),
        job_id: selectedJobId || null,
        job_name: jobName,
        inches,
        bends,
        drawing_segments: drawing.segments.length > 0 ? drawing.segments : undefined,
        created_at: new Date().toISOString(),
      };

      const updatedConfigs = [...savedConfigs, newConfig];
      localStorage.setItem('trim_saved_configs', JSON.stringify(updatedConfigs));
      setSavedConfigs(updatedConfigs);
      
      toast.success('Configuration saved successfully');
      setShowSaveDialog(false);
      setConfigName('');
      setSelectedJobId('');
    } catch (error) {
      console.error('Error saving configuration:', error);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  function loadConfiguration(config: SavedConfig) {
    // Load the inches
    const newInputs = config.inches.map((value, index) => ({
      id: (index + 1).toString(),
      value: value.toString(),
    }));
    setInchInputs(newInputs);
    
    // Load bends
    setNumberOfBends(config.bends.toString());
    
    // Load drawing if it exists
    if (config.drawing_segments && config.drawing_segments.length > 0) {
      setDrawing({
        segments: config.drawing_segments,
        selectedSegmentId: null,
        currentPoint: null,
        nextLabel: 65 + config.drawing_segments.length
      });
      toast.success(`Loaded configuration with drawing: ${config.name}`);
    } else {
      toast.success(`Loaded configuration: ${config.name}`);
    }
    
    setShowLoadDialog(false);
    setPreviewConfig(null);
  }
  
  function showConfigPreview(config: SavedConfig) {
    setPreviewConfig(config);
  }
  
  function calculateConfigPricing(config: SavedConfig) {
    const lfCost = parseFloat(sheetLFCost);
    const bendPriceVal = parseFloat(pricePerBend);
    const markup = parseFloat(markupPercent);
    const cutPriceVal = parseFloat(cutPrice);
    
    if (!lfCost || !bendPriceVal || markup < 0 || !cutPriceVal) {
      return { cost: 0, price: 0, markup: 0, markupPercent: 0 };
    }
    
    const totalInches = config.inches.reduce((sum, val) => sum + val, 0);
    
    // Material cost calculation
    const sheetCost = lfCost * 10;
    const costPerInchBeforeMarkup = sheetCost / 42;
    const materialCost = totalInches * costPerInchBeforeMarkup;
    
    // Apply markup
    const markupMultiplier = 1 + (markup / 100);
    const markedUpSheetCost = sheetCost * markupMultiplier;
    const pricePerInch = markedUpSheetCost / 42;
    
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

  function deleteConfiguration(configId: string) {
    if (!confirm('Delete this saved configuration?')) return;
    
    const updatedConfigs = savedConfigs.filter(c => c.id !== configId);
    localStorage.setItem('trim_saved_configs', JSON.stringify(updatedConfigs));
    setSavedConfigs(updatedConfigs);
    toast.success('Configuration deleted');
  }

  const hasSettings = sheetLFCost && pricePerBend && markupPercent;

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
                    <span className="text-purple-700 font-bold text-xs">Choose Hem Side:</span>
                  </div>
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

            {/* Live Drawing Info - Bottom Right (Minimal Black & White) */}
            {isDrawingMode && drawing.currentPoint && mousePos && (
              <div className="absolute bottom-2 right-2 bg-white/95 backdrop-blur-sm border border-gray-300 rounded p-2 shadow-md">
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

            {/* Stats - Bottom Right */}
            <div className="absolute bottom-2 right-2 bg-white/95 backdrop-blur-sm border-2 border-gray-300 rounded-lg p-2 shadow-lg">
              <div className="text-gray-800 text-xs font-bold">
                <div>Total: {cleanNumber(calculateTotalLength())}"</div>
                <div>Bends: {Math.max(0, drawing.segments.length - 1) + drawing.segments.filter(s => s.hasHem).length}</div>
              </div>
            </div>
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
            <div className="flex gap-1">
              <Button
                onClick={() => setShowInfo(true)}
                size="sm"
                className="bg-green-800 hover:bg-green-700 text-yellow-400 border-2 border-yellow-500 h-7 w-7 p-0"
              >
                <Info className="w-4 h-4" />
              </Button>
              <Button
                onClick={() => {
                  console.log('Opening settings dialog, current values:', { sheetLFCost, pricePerBend, markupPercent, cutPrice });
                  setTempLFCost(sheetLFCost);
                  setTempBendPrice(pricePerBend);
                  setTempMarkupPercent(markupPercent);
                  setTempCutPrice(cutPrice);
                  setShowSettings(true);
                }}
                size="sm"
                className="bg-green-800 hover:bg-green-700 text-yellow-400 border-2 border-yellow-500 h-7 w-7 p-0"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pt-2 p-2 flex-1 overflow-y-auto">
          {!hasSettings ? (
            <div className="bg-yellow-500/10 border-2 border-yellow-500 rounded-lg p-3 text-center">
              <p className="text-yellow-500 font-bold text-sm mb-2">
                Configure Settings First
              </p>
              <Button
                onClick={() => {
                  setTempLFCost(sheetLFCost);
                  setTempBendPrice(pricePerBend);
                  setTempMarkupPercent(markupPercent);
                  setTempCutPrice(cutPrice);
                  setShowSettings(true);
                }}
                className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-3 py-1.5 text-xs"
              >
                <Settings className="w-3 h-3 mr-1" />
                Open Settings
              </Button>
            </div>
          ) : (
            <>
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

              {/* Results Section - Condensed with Cost Breakdown */}
              <div className="space-y-1.5 pt-1.5 border-t-2 border-yellow-500">
                {/* Cost Breakdown - Compact */}
                <div className="bg-black/30 border-2 border-green-800 rounded-lg p-2 space-y-1">
                  <div className="text-green-400 font-bold text-xs uppercase mb-1">Cost Breakdown</div>
                  
                  <div className="flex justify-between text-xs text-white/80">
                    <span>Material Cost:</span>
                    <span className="font-bold text-white">${materialCost.toFixed(2)}</span>
                  </div>
                  
                  <div className="flex justify-between text-xs text-white/80">
                    <span>+ Markup ({markupPercent}%):</span>
                    <span className="font-bold text-green-400">${markupAmount.toFixed(2)}</span>
                  </div>
                  
                  <div className="flex justify-between text-xs text-white/80">
                    <span>+ Bends ({numberOfBends || 0}):</span>
                    <span className="font-bold text-white">${totalBendCost.toFixed(2)}</span>
                  </div>
                  
                  <div className="flex justify-between text-xs text-white/80">
                    <span>+ Cut:</span>
                    <span className="font-bold text-white">${totalCutCost.toFixed(2)}</span>
                  </div>
                  
                  <div className="border-t border-green-700 pt-1 mt-1"></div>
                  
                  <div className="flex justify-between text-xs text-yellow-400 font-bold">
                    <span>Total Material Cost:</span>
                    <span>${(materialCost + markupAmount).toFixed(2)}</span>
                  </div>
                </div>

                {/* Final Selling Price - Compact */}
                <div className="bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-600 rounded-lg p-2 text-center border-2 border-yellow-400 shadow-lg">
                  <div className="text-black font-bold text-xs">SELLING PRICE</div>
                  <div className="text-3xl font-black text-black">${sellingPrice.toFixed(2)}</div>
                  <div className="text-xs text-black/70">All Costs Included</div>
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

              {/* Save/Load Buttons */}
              <div className="flex gap-1.5 pt-1.5 border-t-2 border-green-800">
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
            </>
          )}
        </CardContent>
      </Card>
    </div>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={(open) => {
        if (!open) {
          // Reset temp values to current saved values when closing without saving
          setTempLFCost(sheetLFCost);
          setTempBendPrice(pricePerBend);
          setTempMarkupPercent(markupPercent);
          setTempCutPrice(cutPrice);
        }
        setShowSettings(open);
      }}>
        <DialogContent className="sm:max-w-md bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500 text-xl">
              <Settings className="w-6 h-6" />
              Calculator Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lf-cost" className="text-yellow-400 font-semibold">
                Cost PLF (Per Linear Foot)
              </Label>
              <Input
                id="lf-cost"
                type="number"
                min="0"
                step="0.01"
                value={tempLFCost}
                onChange={(e) => setTempLFCost(e.target.value)}
                placeholder="3.46"
                className="bg-white border-2 border-green-700 focus:border-yellow-500 text-lg font-bold"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bend-price" className="text-yellow-400 font-semibold">
                Price per Bend
              </Label>
              <Input
                id="bend-price"
                type="number"
                min="0"
                step="0.01"
                value={tempBendPrice}
                onChange={(e) => setTempBendPrice(e.target.value)}
                placeholder="1.00"
                className="bg-white border-2 border-green-700 focus:border-yellow-500 text-lg font-bold"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="markup" className="text-yellow-400 font-semibold">
                Markup Percentage (%)
              </Label>
              <Input
                id="markup"
                type="number"
                min="0"
                step="0.1"
                value={tempMarkupPercent}
                onChange={(e) => setTempMarkupPercent(e.target.value)}
                placeholder="35"
                className="bg-white border-2 border-green-700 focus:border-yellow-500 text-lg font-bold"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cut-price" className="text-yellow-400 font-semibold">
                Cut Price (Fixed)
              </Label>
              <Input
                id="cut-price"
                type="number"
                min="0"
                step="0.01"
                value={tempCutPrice}
                onChange={(e) => setTempCutPrice(e.target.value)}
                placeholder="1.00"
                className="bg-white border-2 border-green-700 focus:border-yellow-500 text-lg font-bold"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={saveSettings}
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
              >
                Save Settings
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowSettings(false)}
                className="border-2 border-green-700 text-yellow-400 hover:bg-green-900/20"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Info Dialog */}
      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent className="sm:max-w-lg bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500 text-xl">
              <Info className="w-6 h-6" />
              How the Calculator Works
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-white/90 text-sm">
            <div>
              <h4 className="font-bold text-yellow-400 mb-1">Pricing Formula:</h4>
              <p>Selling Price = (Total Inches × Cost per Inch) + (Bends × Price per Bend) + Cut Cost</p>
            </div>
            <div>
              <h4 className="font-bold text-yellow-400 mb-1">Cost per Inch Calculation:</h4>
              <p>(Cost PLF × 10) × (1 + Markup%) ÷ 42 inches</p>
              <p className="text-xs text-white/60 mt-1">Example: ($3.46 × 10) × 1.35 ÷ 42 = $1.11 per inch</p>
            </div>
            <div>
              <h4 className="font-bold text-yellow-400 mb-1">Settings:</h4>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Cost PLF:</strong> Material cost per linear foot (default $3.46)</li>
                <li><strong>Price per Bend:</strong> Cost per bend (default $1.00)</li>
                <li><strong>Markup %:</strong> Profit margin (default 35%)</li>
                <li><strong>Cut Price:</strong> Fixed cost per cut (default $1.00)</li>
              </ul>
            </div>
          </div>
          <Button
            onClick={() => setShowInfo(false)}
            className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
          >
            Got It
          </Button>
        </DialogContent>
      </Dialog>

      {/* Save Configuration Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-md bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500 text-xl">
              <Save className="w-6 h-6" />
              Save Configuration
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="config-name" className="text-yellow-400 font-semibold">
                Configuration Name
              </Label>
              <Input
                id="config-name"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="Enter a name for this configuration"
                className="bg-white border-2 border-green-700 focus:border-yellow-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="job-select" className="text-yellow-400 font-semibold">
                Link to Job (Optional)
              </Label>
              <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                <SelectTrigger className="bg-white border-2 border-green-700 focus:border-yellow-500">
                  <SelectValue placeholder="Select a job..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Job</SelectItem>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.job_number ? `${job.job_number} - ` : ''}{job.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={saveConfiguration}
                disabled={saving}
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
              >
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowSaveDialog(false);
                  setConfigName('');
                  setSelectedJobId('');
                }}
                className="border-2 border-green-700 text-yellow-400 hover:bg-green-900/20"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Load Configuration Dialog */}
      <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
        <DialogContent className="sm:max-w-4xl bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500 text-xl">
              <FolderOpen className="w-6 h-6" />
              Load Saved Configuration
            </DialogTitle>
          </DialogHeader>
          {savedConfigs.length === 0 ? (
            <div className="text-center py-8 text-white/60">
              <p>No saved configurations yet.</p>
              <p className="text-sm mt-2">Save your first configuration to see it here.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {savedConfigs.map((config) => {
                const pricing = calculateConfigPricing(config);
                const totalInches = config.inches.reduce((sum, val) => sum + val, 0);
                
                return (
                <div
                  key={config.id}
                  className="bg-black/30 border-2 border-green-800 rounded-lg p-3 hover:border-yellow-500 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {/* Thumbnail Preview */}
                    {config.drawing_segments && config.drawing_segments.length > 0 ? (
                      <div className="flex-shrink-0 bg-white rounded border-2 border-gray-300 overflow-hidden">
                        <canvas
                          ref={(canvas) => {
                            if (!canvas) return;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) return;
                            
                            const thumbScale = 25;
                            canvas.width = 100;
                            canvas.height = 100;
                            
                            // White background
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(0, 0, 100, 100);
                            
                            // Find bounding box to center the drawing
                            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                            config.drawing_segments.forEach((seg: LineSegment) => {
                              minX = Math.min(minX, seg.start.x, seg.end.x);
                              minY = Math.min(minY, seg.start.y, seg.end.y);
                              maxX = Math.max(maxX, seg.start.x, seg.end.x);
                              maxY = Math.max(maxY, seg.start.y, seg.end.y);
                            });
                            
                            const width = maxX - minX;
                            const height = maxY - minY;
                            const centerX = (minX + maxX) / 2;
                            const centerY = (minY + maxY) / 2;
                            
                            // Calculate scale to fit in thumbnail
                            const padding = 10;
                            const availWidth = 100 - (padding * 2);
                            const availHeight = 100 - (padding * 2);
                            const scaleX = width > 0 ? availWidth / width : thumbScale;
                            const scaleY = height > 0 ? availHeight / height : thumbScale;
                            const fitScale = Math.min(scaleX, scaleY, thumbScale);
                            
                            // Offset to center the drawing
                            const offsetX = 50 - (centerX * fitScale);
                            const offsetY = 50 - (centerY * fitScale);
                            
                            // Draw segments only - no labels, no measurements, no grid
                            ctx.strokeStyle = '#000000';
                            ctx.lineWidth = 2;
                            config.drawing_segments.forEach((seg: LineSegment) => {
                              const startX = seg.start.x * fitScale + offsetX;
                              const startY = seg.start.y * fitScale + offsetY;
                              const endX = seg.end.x * fitScale + offsetX;
                              const endY = seg.end.y * fitScale + offsetY;
                              
                              ctx.beginPath();
                              ctx.moveTo(startX, startY);
                              ctx.lineTo(endX, endY);
                              ctx.stroke();
                            });
                          }}
                          width={100}
                          height={100}
                          className="block"
                        />
                      </div>
                    ) : (
                      <div className="flex-shrink-0 w-[100px] h-[100px] bg-gray-800 rounded border-2 border-gray-600 flex items-center justify-center">
                        <span className="text-gray-500 text-xs">No Drawing</span>
                      </div>
                    )}
                    
                    {/* Config Details - Two Column Layout */}
                    <div className="flex-1 grid grid-cols-2 gap-x-8">
                      {/* Left Column - Trim Info */}
                      <div>
                        <h4 className="text-yellow-400 font-bold text-xl mb-2">{config.name}</h4>
                        {config.job_name && (
                          <p className="text-white/60 text-sm mb-2">Job: {config.job_name}</p>
                        )}
                        <div className="text-white/80 text-base space-y-1">
                          <p>Total: <span className="text-white font-semibold text-lg">{cleanNumber(totalInches, 2)}"</span></p>
                          <p className="text-white/40 text-sm mt-2">
                            {new Date(config.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      
                      {/* Right Column - Pricing Info */}
                      <div className="text-base space-y-1">
                        <p className="text-white/60 text-sm">Cost: <span className="text-white font-bold text-base">${pricing.cost.toFixed(2)}</span></p>
                        <p className="text-yellow-400 text-sm">Price: <span className="font-bold text-lg">${pricing.price.toFixed(2)}</span></p>
                        <p className="text-green-400 text-sm">Markup: <span className="font-bold text-base">{pricing.markupPercent.toFixed(1)}%</span></p>
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        onClick={() => loadConfiguration(config)}
                        size="sm"
                        className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
                      >
                        Load
                      </Button>
                      <Button
                        onClick={() => deleteConfiguration(config.id)}
                        size="sm"
                        variant="outline"
                        className="border-2 border-red-500 text-red-400 hover:bg-red-900/20 p-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );})}
            </div>
          )}
          <Button
            onClick={() => setShowLoadDialog(false)}
            variant="outline"
            className="w-full border-2 border-green-700 text-yellow-400 hover:bg-green-900/20"
          >
            Close
          </Button>
        </DialogContent>
      </Dialog>

      {/* Preview Configuration Dialog */}
      <Dialog open={!!previewConfig} onOpenChange={(open) => !open && setPreviewConfig(null)}>
        <DialogContent className="sm:max-w-4xl bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500 text-xl">
              <FolderOpen className="w-6 h-6" />
              Preview: {previewConfig?.name}
            </DialogTitle>
          </DialogHeader>
          {previewConfig && (
            <div className="grid grid-cols-2 gap-4">
              {/* Drawing Preview */}
              <div className="bg-white border-2 border-gray-300 rounded-lg overflow-hidden">
                <canvas
                  ref={(canvas) => {
                    if (!canvas || !previewConfig.drawing_segments) return;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    
                    const previewScale = 60;
                    canvas.width = 600;
                    canvas.height = 400;
                    
                    // White background
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, 600, 400);
                    
                    // Draw grid
                    ctx.strokeStyle = '#f0f0f0';
                    ctx.lineWidth = 0.5;
                    for (let x = 0; x <= 600; x += previewScale * 0.125) {
                      ctx.beginPath();
                      ctx.moveTo(x, 0);
                      ctx.lineTo(x, 400);
                      ctx.stroke();
                    }
                    for (let y = 0; y <= 400; y += previewScale * 0.125) {
                      ctx.beginPath();
                      ctx.moveTo(0, y);
                      ctx.lineTo(600, y);
                      ctx.stroke();
                    }
                    
                    // Draw segments
                    previewConfig.drawing_segments.forEach((seg: LineSegment, idx: number) => {
                      const startX = seg.start.x * previewScale;
                      const startY = seg.start.y * previewScale;
                      const endX = seg.end.x * previewScale;
                      const endY = seg.end.y * previewScale;
                      
                      ctx.strokeStyle = '#000000';
                      ctx.lineWidth = 3;
                      ctx.beginPath();
                      ctx.moveTo(startX, startY);
                      ctx.lineTo(endX, endY);
                      ctx.stroke();
                      
                      // Labels
                      const midX = (startX + endX) / 2;
                      const midY = (startY + endY) / 2;
                      ctx.fillStyle = '#999999';
                      ctx.font = '14px sans-serif';
                      ctx.fillText(seg.label, midX - 20, midY);
                      
                      const dx = seg.end.x - seg.start.x;
                      const dy = seg.end.y - seg.start.y;
                      const length = Math.sqrt(dx * dx + dy * dy);
                      ctx.fillStyle = '#000000';
                      ctx.font = 'bold 14px sans-serif';
                      ctx.fillText(`${cleanNumber(length)}"`, midX + 10, midY);
                    });
                  }}
                  className="w-full h-full"
                />
              </div>
              
              {/* Pricing Info */}
              <div className="space-y-4">
                <div className="bg-black/30 border-2 border-green-800 rounded-lg p-4">
                  <h4 className="text-yellow-400 font-bold mb-3">Configuration Details</h4>
                  <div className="space-y-2 text-white/80 text-sm">
                    {previewConfig.job_name && (
                      <p>Job: <span className="text-white font-semibold">{previewConfig.job_name}</span></p>
                    )}
                    <p>Total Inches: <span className="text-white font-semibold">{cleanNumber(previewConfig.inches.reduce((s, v) => s + v, 0), 2)}"</span></p>
                    <p>Bends: <span className="text-white font-semibold">{previewConfig.bends}</span></p>
                    {previewConfig.drawing_segments && (
                      <p>Segments: <span className="text-white font-semibold">{previewConfig.drawing_segments.length}</span></p>
                    )}
                  </div>
                </div>
                
                {(() => {
                  const pricing = calculateConfigPricing(previewConfig);
                  return (
                    <div className="bg-black/30 border-2 border-green-800 rounded-lg p-4">
                      <h4 className="text-yellow-400 font-bold mb-3">Pricing Breakdown</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between text-white/80">
                          <span>Total Cost:</span>
                          <span className="text-white font-bold">${pricing.cost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-white/80">
                          <span>Markup:</span>
                          <span className="text-green-400 font-bold">+${pricing.markup.toFixed(2)}</span>
                        </div>
                        <div className="border-t border-green-700 pt-2">
                          <div className="flex justify-between">
                            <span className="text-yellow-400 font-bold">Selling Price:</span>
                            <span className="text-yellow-400 font-bold text-lg">${pricing.price.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="bg-green-900/30 border border-green-600 rounded p-2 mt-2">
                          <div className="flex justify-between">
                            <span className="text-green-300 font-semibold">Markup %:</span>
                            <span className="text-green-300 font-bold text-lg">{pricing.markupPercent.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      loadConfiguration(previewConfig);
                      setShowLoadDialog(false);
                    }}
                    className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
                  >
                    Load This Configuration
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPreviewConfig(null)}
                    className="border-2 border-green-700 text-yellow-400 hover:bg-green-900/20"
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Segment Measurement/Angle Dialog */}
      <Dialog open={!!editMode} onOpenChange={(open) => !open && setEditMode(null)}>
        <DialogContent className="sm:max-w-md bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500 text-xl">
              <Pencil className="w-6 h-6" />
              Edit Segment {editMode && drawing.segments.find(s => s.id === editMode.segmentId)?.label}
            </DialogTitle>
          </DialogHeader>
          {editMode && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-measurement" className="text-yellow-400 font-semibold">
                  Measurement (inches)
                </Label>
                <Input
                  id="edit-measurement"
                  type="number"
                  min="0"
                  step="0.125"
                  value={editMode.measurement}
                  onChange={(e) => setEditMode({ ...editMode, measurement: e.target.value })}
                  className="bg-white border-2 border-green-700 focus:border-yellow-500 text-lg font-bold"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-angle" className="text-yellow-400 font-semibold">
                  Angle (degrees)
                </Label>
                <p className="text-xs text-white/60">
                  {drawing.segments.findIndex(s => s.id === editMode.segmentId) === 0 
                    ? 'Angle from horizontal (0° = right, 90° = up)'
                    : 'Angle from previous segment'}
                </p>
                <Input
                  id="edit-angle"
                  type="number"
                  min="0"
                  max="360"
                  step="1"
                  value={editMode.angle}
                  onChange={(e) => setEditMode({ ...editMode, angle: e.target.value })}
                  className="bg-white border-2 border-green-700 focus:border-yellow-500 text-lg font-bold"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={applyEdit}
                  className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
                >
                  Apply Changes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditMode(null)}
                  className="border-2 border-green-700 text-yellow-400 hover:bg-green-900/20"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
