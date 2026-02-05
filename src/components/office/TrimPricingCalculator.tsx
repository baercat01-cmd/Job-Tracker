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

const STORAGE_KEY_LF_COST = 'trim_calculator_lf_cost';
const STORAGE_KEY_BEND_PRICE = 'trim_calculator_bend_price';
const STORAGE_KEY_MARKUP_PERCENT = 'trim_calculator_markup_percent';
const STORAGE_KEY_CUT_PRICE = 'trim_calculator_cut_price';

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
  const [showDrawing, setShowDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState<DrawingState>({
    segments: [],
    selectedSegmentId: null,
    currentPoint: null,
    nextLabel: 65 // ASCII 'A'
  });
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [gridSize] = useState(0.125); // 1/8" snap precision
  const [majorGridSize] = useState(0.5); // 1/2" major grid blocks
  const [scale] = useState(80); // pixels per inch (doubled for better visibility)
  const CANVAS_WIDTH = 1600;
  const CANVAS_HEIGHT = 1000;

  // Auto-enable drawing mode when dialog opens
  useEffect(() => {
    if (showDrawing) {
      setIsDrawingMode(true);
      setCanvasReady(false);
      // Small delay to ensure canvas is mounted
      setTimeout(() => setCanvasReady(true), 100);
    } else {
      setIsDrawingMode(false);
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

    // Draw "Ready" indicator if in drawing mode and no points yet
    if (isDrawingMode && drawing.segments.length === 0 && !drawing.currentPoint) {
      ctx.fillStyle = '#666666';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✓ READY - Click anywhere to start drawing', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
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

      // Draw hem if exists
      if (segment.hasHem) {
        const hemPoint = segment.hemAtStart ? segment.start : segment.end;
        const otherPoint = segment.hemAtStart ? segment.end : segment.start;
        
        // Calculate direction vector (reversed for hem)
        const dx = otherPoint.x - hemPoint.x;
        const dy = otherPoint.y - hemPoint.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const unitX = dx / length;
        const unitY = dy / length;
        
        // Hem goes back 0.5" in opposite direction
        const hemEndX = (hemPoint.x - unitX * 0.5) * scale;
        const hemEndY = (hemPoint.y - unitY * 0.5) * scale;
        
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(hemPoint.x * scale, hemPoint.y * scale);
        ctx.lineTo(hemEndX, hemEndY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw hem label
        ctx.fillStyle = '#dc2626';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('HEM', hemEndX - 15, hemEndY - 5);
      }

      // Draw endpoints
      ctx.fillStyle = isSelected ? '#EAB308' : '#000000';
      ctx.beginPath();
      ctx.arc(startX, startY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(endX, endY, 6, 0, Math.PI * 2);
      ctx.fill();

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

    // Draw current point (while drawing)
    if (drawing.currentPoint) {
      const x = drawing.currentPoint.x * scale;
      const y = drawing.currentPoint.y * scale;
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
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
  }, [drawing, showDrawing, canvasReady, scale, gridSize, majorGridSize, CANVAS_WIDTH, CANVAS_HEIGHT, isDrawingMode]);

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

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!canvasRef.current || !isDrawingMode) return;
    
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

  // Load saved values on mount
  useEffect(() => {
    const savedLFCost = localStorage.getItem(STORAGE_KEY_LF_COST);
    const savedBendPrice = localStorage.getItem(STORAGE_KEY_BEND_PRICE);
    const savedMarkupPercent = localStorage.getItem(STORAGE_KEY_MARKUP_PERCENT);
    const savedCutPrice = localStorage.getItem(STORAGE_KEY_CUT_PRICE);
    
    if (savedLFCost) {
      setSheetLFCost(savedLFCost);
      setTempLFCost(savedLFCost);
    }
    if (savedBendPrice) {
      setPricePerBend(savedBendPrice);
      setTempBendPrice(savedBendPrice);
    }
    if (savedMarkupPercent) {
      setMarkupPercent(savedMarkupPercent);
      setTempMarkupPercent(savedMarkupPercent);
    } else {
      setMarkupPercent('32');
      setTempMarkupPercent('32');
    }
    if (savedCutPrice) {
      setCutPrice(savedCutPrice);
      setTempCutPrice(savedCutPrice);
    } else {
      setCutPrice('1.00');
      setTempCutPrice('1.00');
    }
    
    loadJobs();
    loadSavedConfigs();
  }, []);

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

  function saveSettings() {
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
    
    localStorage.setItem(STORAGE_KEY_LF_COST, tempLFCost);
    localStorage.setItem(STORAGE_KEY_BEND_PRICE, tempBendPrice);
    localStorage.setItem(STORAGE_KEY_MARKUP_PERCENT, tempMarkupPercent);
    localStorage.setItem(STORAGE_KEY_CUT_PRICE, tempCutPrice);
    setSheetLFCost(tempLFCost);
    setPricePerBend(tempBendPrice);
    setMarkupPercent(tempMarkupPercent);
    setCutPrice(tempCutPrice);
    setShowSettings(false);
    toast.success('Settings saved successfully');
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
      {/* Main Calculator */}
      <Card className="border-4 border-yellow-500 bg-gradient-to-br from-green-950 via-black to-green-900 max-w-4xl mx-auto shadow-2xl">
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

              {/* Drawing Tool Button */}
              <div className="pt-4 border-t-2 border-green-800">
                <Button
                  onClick={() => setShowDrawing(true)}
                  className="w-full bg-gradient-to-r from-purple-700 to-purple-800 hover:from-purple-600 hover:to-purple-700 text-yellow-400 font-bold border-2 border-yellow-500"
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  2D Drawing Tool
                </Button>
              </div>

              {/* Save/Load Buttons - Moved to Bottom */}
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
              <Label htmlFor="lf-cost" className="text-sm font-semibold text-yellow-400">
                Sheet Cost per LF (42" wide) *
              </Label>
              <p className="text-xs text-white/60">
                Enter your COST per lineal foot (before markup).
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-700 font-bold">$</span>
                <Input
                  id="lf-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tempLFCost}
                  onChange={(e) => setTempLFCost(e.target.value)}
                  placeholder="0.00"
                  className="pl-7 h-11 text-base bg-white border-2 border-green-700 focus:border-yellow-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="markup-percent" className="text-sm font-semibold text-yellow-400">
                Markup Percentage *
              </Label>
              <div className="relative">
                <Input
                  id="markup-percent"
                  type="number"
                  min="0"
                  step="0.1"
                  value={tempMarkupPercent}
                  onChange={(e) => setTempMarkupPercent(e.target.value)}
                  placeholder="32"
                  className="pr-8 h-11 text-base bg-white border-2 border-green-700 focus:border-yellow-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-700 font-bold">%</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bend-price" className="text-sm font-semibold text-yellow-400">
                Price per Bend *
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-700 font-bold">$</span>
                <Input
                  id="bend-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tempBendPrice}
                  onChange={(e) => setTempBendPrice(e.target.value)}
                  placeholder="0.00"
                  className="pl-7 h-11 text-base bg-white border-2 border-green-700 focus:border-yellow-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cut-price" className="text-sm font-semibold text-yellow-400">
                Cut Price *
              </Label>
              <p className="text-xs text-white/60">
                Fixed cost per cut (typically $1.00)
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-700 font-bold">$</span>
                <Input
                  id="cut-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tempCutPrice}
                  onChange={(e) => setTempCutPrice(e.target.value)}
                  placeholder="1.00"
                  className="pl-7 h-11 text-base bg-white border-2 border-green-700 focus:border-yellow-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={saveSettings}
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold border-2 border-yellow-600"
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
              How It Works
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-white">
            <div className="space-y-2">
              <h4 className="font-semibold text-yellow-400">Calculation Method:</h4>
              <div className="space-y-1 text-sm bg-black/30 p-4 rounded border-2 border-green-800">
                <p><strong className="text-yellow-400">$ per In:</strong> (Sheet Cost/LF × Markup) ÷ 12</p>
                <p><strong className="text-yellow-400">Total Inch $:</strong> Sum of all lengths × $ per In</p>
                <p><strong className="text-yellow-400">Total Bend $:</strong> Number of Bends × Price/Bend</p>
                <p><strong className="text-yellow-400">Cut Cost:</strong> Fixed charge (set in settings)</p>
                <p><strong className="text-yellow-400">Selling Price:</strong> Total Inch $ + Total Bend $ + Cut Cost</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-yellow-400">Key Features:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-white/80">
                <li>Base sheet: 42" wide × 10' long (120")</li>
                <li>Add multiple length measurements dynamically</li>
                <li>Configurable markup percentage on material cost</li>
                <li>Separate labor charge per bend</li>
                <li>Fixed cut cost included automatically</li>
                <li>Save and load configurations for different jobs</li>
              </ul>
            </div>

            <Button
              onClick={() => setShowInfo(false)}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
            >
              Got It
            </Button>
          </div>
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
                Configuration Name *
              </Label>
              <Input
                id="config-name"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="e.g., Building A - Corner Trim"
                className="bg-white border-2 border-green-700 focus:border-yellow-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="job-select" className="text-yellow-400 font-semibold">
                Assign to Job (Optional)
              </Label>
              <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                <SelectTrigger className="bg-white border-2 border-green-700 focus:border-yellow-500">
                  <SelectValue placeholder="Select a job..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No Job Assignment</SelectItem>
                  {jobs.map(job => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.job_number ? `${job.job_number} - ` : ''}{job.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="bg-black/30 border-2 border-green-800 rounded p-3 text-sm text-white/80">
              <p className="font-semibold text-yellow-400 mb-2">Current Configuration:</p>
              <p>• Lengths: {inchInputs.filter(i => i.value).map(i => i.value).join(', ')} inches</p>
              <p>• Bends: {numberOfBends || 0}</p>
              <p>• Selling Price: ${sellingPrice.toFixed(2)}</p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={saveConfiguration}
                disabled={saving}
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowSaveDialog(false)}
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
        <DialogContent className="sm:max-w-2xl bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500 max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500 text-xl">
              <FolderOpen className="w-6 h-6" />
              Load Saved Configuration
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {savedConfigs.length === 0 ? (
              <div className="text-center py-8 text-white/60">
                <p>No saved configurations yet</p>
                <p className="text-sm mt-2">Save a configuration to see it here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {savedConfigs.map(config => (
                  <div key={config.id} className="bg-black/30 border-2 border-green-800 rounded-lg p-4 hover:border-yellow-500 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-bold text-yellow-400 text-lg mb-1">{config.name}</h4>
                        {config.job_name && (
                          <p className="text-sm text-white/60 mb-2">Job: {config.job_name}</p>
                        )}
                        <div className="text-sm text-white/80 space-y-1">
                          <p>• Lengths: {config.inches.join(', ')} inches</p>
                          <p>• Bends: {config.bends}</p>
                          <p className="text-xs text-white/60">
                            Saved: {new Date(config.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 ml-4">
                        <Button
                          onClick={() => loadConfiguration(config)}
                          className="bg-green-700 hover:bg-green-600 text-yellow-400 font-bold border border-yellow-500"
                        >
                          Load
                        </Button>
                        <Button
                          onClick={() => deleteConfiguration(config.id)}
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="pt-4 border-t-2 border-green-800">
            <Button
              variant="outline"
              onClick={() => setShowLoadDialog(false)}
              className="w-full border-2 border-green-700 text-yellow-400 hover:bg-green-900/20"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 2D Drawing Dialog */}
      <Dialog open={showDrawing} onOpenChange={setShowDrawing}>
        <DialogContent className="max-w-6xl bg-gradient-to-br from-green-950 to-black border-4 border-yellow-500 overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500 text-xl">
              <Pencil className="w-6 h-6" />
              2D Trim Designer
            </DialogTitle>
          </DialogHeader>
          
          <div className="relative">
            {/* Canvas with Controls Overlay */}
            <div className="relative border-4 border-gray-300 rounded overflow-hidden shadow-2xl">
              {!canvasReady ? (
                <div className="w-full h-[1000px] flex items-center justify-center bg-gray-100">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-gray-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-700 font-semibold">Loading Canvas...</p>
                  </div>
                </div>
              ) : (
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  onClick={handleCanvasClick}
                  className="cursor-crosshair"
                  style={{ display: 'block' }}
                />
              )}
              
              {/* Top Controls - Overlaid on Canvas */}
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-3 bg-white/95 backdrop-blur-sm p-3 rounded-lg border-2 border-gray-300 shadow-lg">
                <div className="flex gap-2">
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-100 border-2 border-green-500 rounded">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-green-700 font-bold text-sm">Drawing Active (1/2" blocks, 1/8" snap)</span>
                  </div>
                  
                  <Button
                    onClick={clearDrawing}
                    size="sm"
                    variant="outline"
                    className="border-2 border-red-500 text-red-600 hover:bg-red-50"
                  >
                    <Trash className="w-4 h-4 mr-2" />
                    Clear All
                  </Button>
                </div>
                
                <div className="text-gray-800 text-sm font-bold bg-gray-100 px-4 py-2 rounded border-2 border-gray-300">
                  Total: {calculateTotalLength().toFixed(3)}" | Bends: {Math.max(0, drawing.segments.length - 1) + drawing.segments.filter(s => s.hasHem).length}
                </div>
              </div>

              {/* Selected Segment Controls - Overlaid */}
              {drawing.selectedSegmentId && (
                <div className="absolute top-20 left-4 bg-yellow-50/95 backdrop-blur-sm border-2 border-yellow-500 rounded-lg p-3 shadow-lg max-w-md">
                  <p className="text-yellow-800 font-bold mb-2">
                    Selected: {drawing.segments.find(s => s.id === drawing.selectedSegmentId)?.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => addHemToSelected(true)}
                      size="sm"
                      className="bg-green-600 text-white hover:bg-green-700"
                    >
                      Add Hem (Start)
                    </Button>
                    <Button
                      onClick={() => addHemToSelected(false)}
                      size="sm"
                      className="bg-green-600 text-white hover:bg-green-700"
                    >
                      Add Hem (End)
                    </Button>
                    <Button
                      onClick={removeHemFromSelected}
                      size="sm"
                      variant="outline"
                      className="border-red-500 text-red-600 hover:bg-red-50"
                    >
                      Remove Hem
                    </Button>
                    <Button
                      onClick={deleteSelectedSegment}
                      size="sm"
                      variant="outline"
                      className="border-red-500 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              )}

              {/* Action Buttons - Bottom Overlay */}
              <div className="absolute bottom-4 left-4 right-4 flex gap-3 bg-white/95 backdrop-blur-sm p-4 rounded-lg border-2 border-gray-300 shadow-lg">
                <Button
                  onClick={applyDrawingToCalculator}
                  className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold text-lg py-6"
                >
                  Apply to Calculator
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowDrawing(false)}
                  className="border-2 border-gray-400 text-gray-700 hover:bg-gray-100 py-6 px-8"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
