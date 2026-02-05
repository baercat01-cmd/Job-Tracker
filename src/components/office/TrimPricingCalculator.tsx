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

export function TrimPricingCalculator() {
  // Persistent settings
  const [sheetLFCost, setSheetLFCost] = useState<string>('');
  const [pricePerBend, setPricePerBend] = useState<string>('');
  const [markupPercent, setMarkupPercent] = useState<string>('32');
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
  
  // Dialog states
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  
  const [tempLFCost, setTempLFCost] = useState('');
  const [tempBendPrice, setTempBendPrice] = useState('');
  const [tempMarkupPercent, setTempMarkupPercent] = useState('32');
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
  const BASE_CANVAS_WIDTH = 1600;
  const BASE_CANVAS_HEIGHT = 1000;
  const CANVAS_WIDTH = BASE_CANVAS_WIDTH * (scale / 80);
  const CANVAS_HEIGHT = BASE_CANVAS_HEIGHT * (scale / 80);

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
      
      // Measurement text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${previewLength.toFixed(3)}"`, midX, midY - 12);
      
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
    if (drawingLocked) {
      if (drawing.segments.length === 0) {
        ctx.fillStyle = '#666666';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🔒 Unlock to start drawing', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.textAlign = 'left';
      } else if (!drawing.selectedSegmentId) {
        ctx.fillStyle = '#666666';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Click on a line to edit it', CANVAS_WIDTH / 2, 30);
        ctx.textAlign = 'left';
      }
    } else if (!drawingLocked && drawing.segments.length === 0 && !drawing.currentPoint) {
      ctx.fillStyle = '#666666';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✓ UNLOCKED - Click anywhere to start drawing', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      ctx.textAlign = 'left';
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

      // Don't draw endpoint dots - removed as per request

      // Draw hem if exists (U-shaped)
      if (segment.hasHem) {
        const hemPoint = segment.hemAtStart ? segment.start : segment.end;
        const otherPoint = segment.hemAtStart ? segment.end : segment.start;
        
        // Calculate direction vector
        const dx = otherPoint.x - hemPoint.x;
        const dy = otherPoint.y - hemPoint.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const unitX = dx / length;
        const unitY = dy / length;
        
        // Perpendicular vector (to the left of the line)
        const perpX = -unitY;
        const perpY = unitX;
        
        // U-shape hem: goes perpendicular 0.5", then back parallel 0.5", then back perpendicular 0.5"
        const hemWidth = 0.5;
        
        // First leg: perpendicular outward
        const p1x = hemPoint.x * scale;
        const p1y = hemPoint.y * scale;
        const p2x = (hemPoint.x + perpX * hemWidth) * scale;
        const p2y = (hemPoint.y + perpY * hemWidth) * scale;
        
        // Second leg: parallel to main line (backward)
        const p3x = (hemPoint.x + perpX * hemWidth - unitX * hemWidth) * scale;
        const p3y = (hemPoint.y + perpY * hemWidth - unitY * hemWidth) * scale;
        
        // Third leg: perpendicular back to main line
        const p4x = (hemPoint.x - unitX * hemWidth) * scale;
        const p4y = (hemPoint.y - unitY * hemWidth) * scale;
        
        // Draw U-shaped hem
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p1x, p1y);
        ctx.lineTo(p2x, p2y); // Out
        ctx.lineTo(p3x, p3y); // Back
        ctx.lineTo(p4x, p4y); // In
        ctx.stroke();
        
        // Draw hem label
        ctx.fillStyle = '#dc2626';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('HEM', p2x - 20, p2y - 5);
      }

      // Draw label
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(segment.label, midX - 5, midY - 12);

      // Calculate and draw measurement
      const dx = segment.end.x - segment.start.x;
      const dy = segment.end.y - segment.start.y;
      const lengthInInches = Math.sqrt(dx * dx + dy * dy);
      
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`${lengthInInches.toFixed(3)}"`, midX + 10, midY + 5);

      // Calculate and draw angle (if not first segment)
      const segmentIndex = drawing.segments.indexOf(segment);
      if (segmentIndex > 0) {
        const prevSegment = drawing.segments[segmentIndex - 1];
        const angle = calculateAngleBetweenSegments(prevSegment, segment);
        
        ctx.fillStyle = '#6b21a8';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(`${Math.round(angle)}°`, startX + 15, startY - 5);
      }
    });

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

    // Draw "Colour Side" markers
    drawing.segments.forEach((segment, index) => {
      const startX = segment.start.x * scale;
      const startY = segment.start.y * scale;
      
      if (index === 0) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(startX - 15, startY, 8, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = '#3b82f6';
        ctx.font = '10px sans-serif';
        ctx.fillText('⊙', startX - 18, startY + 4);
      }
    });
  }, [drawing, showDrawing, canvasReady, scale, gridSize, majorGridSize, CANVAS_WIDTH, CANVAS_HEIGHT, isDrawingMode, mousePos, drawingLocked]);

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
    
    // If locked (not drawing mode), check if user clicked on a segment to select it
    if (drawingLocked) {
      const rect = canvasRef.current.getBoundingClientRect();
      const clickX = (e.clientX - rect.left) / scale;
      const clickY = (e.clientY - rect.top) / scale;
      
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
    if (!isDrawingMode) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    
    // Snap to grid
    const snappedX = Math.round(x / gridSize) * gridSize;
    const snappedY = Math.round(y / gridSize) * gridSize;
    
    const point: Point = { x: snappedX, y: snappedY };
    
    if (!drawing.currentPoint) {
      // Start new line
      setDrawing(prev => ({ ...prev, currentPoint: point }));
    } else {
      // Complete line
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
        currentPoint: point, // Continue from this point
        selectedSegmentId: null,
        nextLabel: prev.nextLabel + 1
      }));
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
    toast.success('Drawing stopped - click to start a new line');
  }

  function addHemToSelected(atStart: boolean) {
    if (!drawing.selectedSegmentId) {
      toast.error('No segment selected');
      return;
    }
    
    setDrawing(prev => ({
      ...prev,
      segments: prev.segments.map(seg => 
        seg.id === prev.selectedSegmentId
          ? { ...seg, hasHem: true, hemAtStart: atStart }
          : seg
      )
    }));
    toast.success('Hem added');
  }

  function addHemToLastSegment() {
    if (drawing.segments.length === 0) {
      toast.error('No segments drawn yet');
      return;
    }
    
    const lastSegment = drawing.segments[drawing.segments.length - 1];
    if (lastSegment.hasHem) {
      toast.error('Last segment already has a hem');
      return;
    }
    
    setDrawing(prev => ({
      ...prev,
      segments: prev.segments.map((seg, idx) => 
        idx === prev.segments.length - 1
          ? { ...seg, hasHem: true, hemAtStart: false }
          : seg
      )
    }));
    toast.success('Hem added to last segment');
  }

  function removeHemFromSelected() {
    if (!drawing.selectedSegmentId) {
      toast.error('No segment selected');
      return;
    }
    
    const segment = drawing.segments.find(s => s.id === drawing.selectedSegmentId);
    if (!segment?.hasHem) {
      toast.error('Selected segment has no hem');
      return;
    }
    
    setDrawing(prev => ({
      ...prev,
      segments: prev.segments.map(seg => 
        seg.id === prev.selectedSegmentId
          ? { ...seg, hasHem: false, hemAtStart: false }
          : seg
      )
    }));
    toast.success('Hem removed');
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
      
      // Add hem length
      if (segment.hasHem) {
        total += 0.5; // Hem is always 0.5"
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
    
    toast.success(`Applied: ${totalLength.toFixed(2)}" with ${bends} bends`);
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
      const { data, error } = await supabase
        .from('trim_calculator_settings')
        .select('*')
        .limit(1)
        .single();
      
      if (error) {
        console.error('Error loading settings:', error);
        // Use defaults if no settings found
        setMarkupPercent('32');
        setTempMarkupPercent('32');
        setCutPrice('1.00');
        setTempCutPrice('1.00');
        return;
      }
      
      if (data) {
        const lfCost = data.sheet_lf_cost?.toString() || '';
        const bendPrice = data.price_per_bend?.toString() || '';
        const markup = data.markup_percent?.toString() || '32';
        const cut = data.cut_price?.toString() || '1.00';
        
        setSheetLFCost(lfCost);
        setTempLFCost(lfCost);
        setPricePerBend(bendPrice);
        setTempBendPrice(bendPrice);
        setMarkupPercent(markup);
        setTempMarkupPercent(markup);
        setCutPrice(cut);
        setTempCutPrice(cut);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
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
      // Check if settings exist
      const { data: existing } = await supabase
        .from('trim_calculator_settings')
        .select('id')
        .limit(1)
        .single();
      
      const settingsData = {
        sheet_lf_cost: lfCost,
        price_per_bend: bendPrice,
        markup_percent: markup,
        cut_price: cut,
        updated_at: new Date().toISOString()
      };
      
      let error;
      
      if (existing?.id) {
        // Update existing settings
        ({ error } = await supabase
          .from('trim_calculator_settings')
          .update(settingsData)
          .eq('id', existing.id));
      } else {
        // Insert new settings
        ({ error } = await supabase
          .from('trim_calculator_settings')
          .insert([settingsData]));
      }
      
      if (error) throw error;
      
      setSheetLFCost(tempLFCost);
      setPricePerBend(tempBendPrice);
      setMarkupPercent(tempMarkupPercent);
      setCutPrice(tempCutPrice);
      setShowSettings(false);
      toast.success('Settings saved for all users');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    }
  }

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
      return;
    }

    // Calculate cost per inch from the 42" wide sheet
    const markupMultiplier = 1 + (markup / 100);
    const sellingPricePerLF = lfCost * markupMultiplier;
    const pricePerInch = sellingPricePerLF / 12;
    setCostPerInch(pricePerInch);
    
    // Cost per bend
    setCostPerBend(bendPriceVal);
    
    // Total bend cost = bends × price per bend
    const bendCost = bends * bendPriceVal;
    setTotalBendCost(bendCost);
    
    // Total inch cost = total inches × price per inch
    const inchCost = totalIn * pricePerInch;
    setTotalInchCost(inchCost);
    
    // Cut cost (always present)
    const cutCost = cutPriceVal || 0;
    setTotalCutCost(cutCost);
    
    // Selling price = total inch cost + total bend cost + cut cost
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
    
    setShowLoadDialog(false);
    toast.success(`Loaded configuration: ${config.name}`);
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
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-[1800px] mx-auto">
      {/* Drawing Tool - Left Side */}
      <Card className="border-4 border-yellow-500 bg-gradient-to-br from-green-950 via-black to-green-900 shadow-2xl">
        <CardHeader className="pb-4 border-b-2 border-yellow-500">
          <CardTitle className="flex items-center gap-3 text-yellow-500">
            <Pencil className="w-7 h-7" />
            <span className="text-2xl font-bold">2D Drawing Tool</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="relative border-4 border-gray-300 rounded overflow-hidden shadow-2xl bg-white">
            {!canvasReady ? (
              <div className="w-full h-[600px] flex items-center justify-center bg-gray-100">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-gray-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-700 font-semibold">Loading Canvas...</p>
                </div>
              </div>
            ) : (
              <div className="overflow-auto" style={{ maxHeight: '600px' }}>
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
              {/* Lock/Unlock Drawing Button */}
              <Button
                onClick={() => {
                  setDrawingLocked(!drawingLocked);
                  if (!drawingLocked) {
                    // Locking - stop drawing
                    setIsDrawingMode(false);
                    setDrawing(prev => ({ ...prev, currentPoint: null }));
                  }
                }}
                size="sm"
                className={`h-7 px-3 font-bold text-xs ${
                  drawingLocked 
                    ? 'bg-red-600 hover:bg-red-700 text-white' 
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {drawingLocked ? '🔒 Locked (Click to Edit)' : '🔓 Drawing Mode'}
              </Button>
              
              {!drawingLocked && (
                <>
                  <div className="flex items-center gap-2 px-2 py-1 bg-green-100 border-2 border-green-500 rounded">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-green-700 font-bold">Drawing Active</span>
                  </div>
                  
                  {drawing.currentPoint && (
                    <Button
                      onClick={stopDrawing}
                      size="sm"
                      className="h-7 px-2 bg-orange-600 text-white hover:bg-orange-700 border border-orange-400 text-xs"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Stop
                    </Button>
                  )}
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
              {(drawing.selectedSegmentId || drawing.segments.length > 0) && (
                <Button
                  onClick={() => {
                    if (drawing.selectedSegmentId) {
                      // Add hem to selected segment
                      const seg = drawing.segments.find(s => s.id === drawing.selectedSegmentId);
                      if (seg?.hasHem) {
                        removeHemFromSelected();
                      } else {
                        addHemToSelected(false);
                      }
                    } else {
                      addHemToLastSegment();
                    }
                  }}
                  size="sm"
                  className={`h-7 px-2 text-xs font-bold ${
                    drawing.selectedSegmentId && drawing.segments.find(s => s.id === drawing.selectedSegmentId)?.hasHem
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-purple-600 hover:bg-purple-700 text-white'
                  }`}
                >
                  {drawing.selectedSegmentId && drawing.segments.find(s => s.id === drawing.selectedSegmentId)?.hasHem
                    ? '- Remove Hem'
                    : '+ Add Hem'}
                </Button>
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
                        <span>{seg.label} {seg.hasHem && '(HEM)'}</span>
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

            {/* Stats - Bottom Right */}
            <div className="absolute bottom-2 right-2 bg-white/95 backdrop-blur-sm border-2 border-gray-300 rounded-lg p-2 shadow-lg">
              <div className="text-gray-800 text-xs font-bold">
                <div>Total: {calculateTotalLength().toFixed(3)}"</div>
                <div>Bends: {Math.max(0, drawing.segments.length - 1) + drawing.segments.filter(s => s.hasHem).length}</div>
              </div>
            </div>
          </div>
          
          {/* Apply Button */}
          <Button
            onClick={applyDrawingToCalculator}
            className="w-full mt-4 bg-yellow-500 hover:bg-yellow-600 text-black font-bold text-lg py-6"
            disabled={drawing.segments.length === 0}
          >
            Apply Drawing to Calculator →
          </Button>
        </CardContent>
      </Card>

      {/* Calculator - Right Side */}
      <Card className="border-4 border-yellow-500 bg-gradient-to-br from-green-950 via-black to-green-900 shadow-2xl">
        <CardHeader className="pb-4 border-b-2 border-yellow-500">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3 text-yellow-500">
              <Calculator className="w-7 h-7" />
              <span className="text-2xl font-bold">Flat Panel Trim Calculator</span>
            </CardTitle>
            <div className="flex gap-2">
              <Button
                onClick={() => setShowInfo(true)}
                size="sm"
                className="bg-green-800 hover:bg-green-700 text-yellow-400 border-2 border-yellow-500"
              >
                <Info className="w-5 h-5" />
              </Button>
              <Button
                onClick={() => {
                  setTempLFCost(sheetLFCost);
                  setTempBendPrice(pricePerBend);
                  setTempMarkupPercent(markupPercent);
                  setTempCutPrice(cutPrice);
                  setShowSettings(true);
                }}
                size="sm"
                className="bg-green-800 hover:bg-green-700 text-yellow-400 border-2 border-yellow-500"
              >
                <Settings className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {!hasSettings ? (
            <div className="bg-yellow-500/10 border-2 border-yellow-500 rounded-lg p-6 text-center">
              <p className="text-yellow-500 font-bold text-lg mb-3">
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
                className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold text-lg px-6 py-3"
              >
                <Settings className="w-5 h-5 mr-2" />
                Open Settings
              </Button>
            </div>
          ) : (
            <>
              {/* Steel Section - Dynamic Inch Inputs */}
              <div className="space-y-4 bg-black/30 p-5 rounded-lg border-2 border-green-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-yellow-500 uppercase tracking-wider">Steel Measurements</h3>
                  <Button
                    onClick={addInchInput}
                    size="sm"
                    className="bg-green-700 hover:bg-green-600 text-yellow-400 font-bold border border-yellow-500"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Length
                  </Button>
                </div>
                
                <div className="grid gap-3">
                  {inchInputs.map((input, index) => (
                    <div key={input.id} className="flex items-center gap-3">
                      <div className="flex-1">
                        <Label className="text-xs text-yellow-400 mb-1 block">
                          Length #{index + 1} (inches)
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.125"
                          value={input.value}
                          onChange={(e) => updateInchInput(input.id, e.target.value)}
                          placeholder="0"
                          className="h-12 text-center text-xl bg-white border-2 border-green-700 font-bold focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500"
                        />
                      </div>
                      {inchInputs.length > 1 && (
                        <Button
                          onClick={() => removeInchInput(input.id)}
                          size="sm"
                          variant="ghost"
                          className="mt-6 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        >
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Bends Input */}
                <div className="space-y-2 pt-3 border-t border-green-800">
                  <Label className="text-yellow-400 font-semibold">Number of Bends</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={numberOfBends}
                    onChange={(e) => setNumberOfBends(e.target.value)}
                    placeholder="0"
                    className="h-12 text-center text-xl bg-white border-2 border-green-700 font-bold focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500"
                  />
                </div>
              </div>

              {/* Results Section - Condensed */}
              <div className="space-y-3 pt-3 border-t-4 border-yellow-500">
                {/* Final Selling Price - Smaller */}
                <div className="bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-600 rounded-lg p-4 text-center border-4 border-yellow-400 shadow-2xl">
                  <div className="text-black font-bold text-sm mb-1">SELLING PRICE</div>
                  <div className="text-4xl font-black text-black">${sellingPrice.toFixed(2)}</div>
                  <div className="text-xs text-black/80 mt-1">Material + Bends + Cut</div>
                </div>

                {/* Clear Button */}
                <Button
                  onClick={clearCalculation}
                  variant="outline"
                  className="w-full border-2 border-red-500 text-red-400 hover:bg-red-900/20 hover:text-red-300 font-bold"
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear All
                </Button>
              </div>

              {/* Save/Load Buttons */}
              <div className="flex gap-3 pt-4 border-t-2 border-green-800">
                <Button
                  onClick={() => setShowSaveDialog(true)}
                  className="flex-1 bg-gradient-to-r from-green-700 to-green-800 hover:from-green-600 hover:to-green-700 text-yellow-400 font-bold border-2 border-yellow-500"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Configuration
                </Button>
                <Button
                  onClick={() => setShowLoadDialog(true)}
                  className="flex-1 bg-gradient-to-r from-green-700 to-green-800 hover:from-green-600 hover:to-green-700 text-yellow-400 font-bold border-2 border-yellow-500"
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Load Saved ({savedConfigs.length})
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
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
                Sheet Cost per LF (42" wide)
              </Label>
              <Input
                id="lf-cost"
                type="number"
                min="0"
                step="0.01"
                value={tempLFCost}
                onChange={(e) => setTempLFCost(e.target.value)}
                placeholder="Enter cost per linear foot"
                className="bg-white border-2 border-green-700 focus:border-yellow-500"
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
                placeholder="Enter price per bend"
                className="bg-white border-2 border-green-700 focus:border-yellow-500"
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
                placeholder="Enter markup percentage"
                className="bg-white border-2 border-green-700 focus:border-yellow-500"
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
                placeholder="Enter cut price"
                className="bg-white border-2 border-green-700 focus:border-yellow-500"
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
              <p>Sheet Cost per LF × (1 + Markup%) ÷ 12 inches</p>
            </div>
            <div>
              <h4 className="font-bold text-yellow-400 mb-1">Settings:</h4>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Sheet Cost per LF:</strong> Your material cost for a 42" wide sheet</li>
                <li><strong>Price per Bend:</strong> Labor/equipment cost per bend</li>
                <li><strong>Markup %:</strong> Your profit margin (default 32%)</li>
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
        <DialogContent className="sm:max-w-2xl bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500">
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
              {savedConfigs.map((config) => (
                <div
                  key={config.id}
                  className="bg-black/30 border-2 border-green-800 rounded-lg p-4 hover:border-yellow-500 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-yellow-400 font-bold">{config.name}</h4>
                      {config.job_name && (
                        <p className="text-white/60 text-sm">Job: {config.job_name}</p>
                      )}
                      <div className="mt-2 text-white/80 text-sm">
                        <p>Total Inches: {config.inches.reduce((sum, val) => sum + val, 0).toFixed(2)}"</p>
                        <p>Bends: {config.bends}</p>
                        <p className="text-white/40 text-xs mt-1">
                          Saved: {new Date(config.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
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
                        className="border-2 border-red-500 text-red-400 hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
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
