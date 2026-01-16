import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Move, MousePointer, DoorOpen, Square } from 'lucide-react';
import { toast } from 'sonner';

interface FloorPlanBuilderProps {
  width: number;
  length: number;
  quoteId?: string;
}

interface Wall {
  id: string;
  start_x: number;
  start_y: number;
  end_x: number;
  end_y: number;
}

interface Opening {
  id: string;
  opening_type: 'walkdoor' | 'window' | 'overhead_door' | 'other';
  size_detail: string;
  quantity: number;
  location: string;
  position_x?: number;
  position_y?: number;
  wall?: string;
  swing_direction?: 'left' | 'right' | 'in' | 'out';
}

interface FloorDrain {
  id: string;
  length_ft: number;
  orientation: string;
  location: string;
}

interface Cupola {
  id: string;
  size: string;
  cupola_type: string;
  weather_vane: boolean;
  location: string;
}

const SCALE = 10;
const OPENING_SIZE = 10; // Size of opening marker in pixels

export function FloorPlanBuilder({ width, length, quoteId }: FloorPlanBuilderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [floorDrains, setFloorDrains] = useState<FloorDrain[]>([]);
  const [cupolas, setCupolas] = useState<Cupola[]>([]);
  
  // Drawing modes
  const [mode, setMode] = useState<'select' | 'wall' | 'door' | 'window'>('select');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [selectedOpening, setSelectedOpening] = useState<Opening | null>(null);
  const [draggingOpening, setDraggingOpening] = useState<Opening | null>(null);
  
  // Dialog states
  const [showAddOpening, setShowAddOpening] = useState(false);
  const [showAddDrain, setShowAddDrain] = useState(false);
  const [showAddCupola, setShowAddCupola] = useState(false);
  const [showEditOpening, setShowEditOpening] = useState(false);
  
  // Forms
  const [newOpening, setNewOpening] = useState({
    opening_type: 'walkdoor' as const,
    size_detail: '',
    quantity: 1,
    location: '',
    wall: 'front',
    swing_direction: 'right' as const,
  });

  const [editingOpening, setEditingOpening] = useState<Opening | null>(null);

  const [newDrain, setNewDrain] = useState({
    length_ft: 10,
    orientation: 'horizontal',
    location: '',
  });

  const [newCupola, setNewCupola] = useState({
    size: '24"x24"',
    cupola_type: 'standard',
    weather_vane: false,
    location: '',
  });

  useEffect(() => {
    if (quoteId) {
      loadFloorPlanData();
    }
  }, [quoteId]);

  useEffect(() => {
    drawFloorPlan();
  }, [width, length, walls, openings, floorDrains, selectedOpening, draggingOpening]);

  async function loadFloorPlanData() {
    if (!quoteId) return;

    try {
      const { data: wallsData } = await supabase
        .from('quote_interior_walls')
        .select('*')
        .eq('quote_id', quoteId);
      setWalls(wallsData || []);

      const { data: openingsData } = await supabase
        .from('quote_openings')
        .select('*')
        .eq('quote_id', quoteId);
      setOpenings(openingsData || []);

      const { data: drainsData } = await supabase
        .from('quote_floor_drains')
        .select('*')
        .eq('quote_id', quoteId);
      setFloorDrains(drainsData || []);

      const { data: cupolasData } = await supabase
        .from('quote_cupolas')
        .select('*')
        .eq('quote_id', quoteId);
      setCupolas(cupolasData || []);
    } catch (error: any) {
      console.error('Error loading floor plan data:', error);
    }
  }

  function drawFloorPlan() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasWidth = width * SCALE + 100;
    const canvasHeight = length * SCALE + 100;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw building outline
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 3;
    ctx.strokeRect(50, 50, width * SCALE, length * SCALE);

    // Draw dimension labels
    ctx.fillStyle = '#000';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${width}' (Width)`, 50 + (width * SCALE) / 2, 35);

    ctx.save();
    ctx.translate(35, 50 + (length * SCALE) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${length}' (Length)`, 0, 0);
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.fillText(`Scale: 1:${SCALE}'`, 10, canvasHeight - 10);

    // Draw interior walls
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2;
    walls.forEach(wall => {
      ctx.beginPath();
      ctx.moveTo(50 + wall.start_x * SCALE, 50 + wall.start_y * SCALE);
      ctx.lineTo(50 + wall.end_x * SCALE, 50 + wall.end_y * SCALE);
      ctx.stroke();
    });

    // Draw openings (doors and windows)
    openings.forEach(opening => {
      const x = opening.position_x !== undefined ? 50 + opening.position_x * SCALE : 50;
      const y = opening.position_y !== undefined ? 50 + opening.position_y * SCALE : 50;
      
      const isSelected = selectedOpening?.id === opening.id;
      const isDraggingThis = draggingOpening?.id === opening.id;

      // Color based on type
      let color = '#10b981'; // Green for walkdoor
      if (opening.opening_type === 'window') color = '#3b82f6'; // Blue
      if (opening.opening_type === 'overhead_door') color = '#f59e0b'; // Orange
      if (opening.opening_type === 'other') color = '#a855f7'; // Purple

      // Highlight if selected or dragging
      if (isSelected || isDraggingThis) {
        ctx.fillStyle = color + '40';
        ctx.fillRect(x - OPENING_SIZE - 2, y - OPENING_SIZE - 2, OPENING_SIZE * 2 + 4, OPENING_SIZE * 2 + 4);
      }

      // Draw opening marker
      ctx.fillStyle = color;
      ctx.fillRect(x - OPENING_SIZE/2, y - OPENING_SIZE/2, OPENING_SIZE, OPENING_SIZE);

      // Draw door swing for doors
      if (opening.opening_type === 'walkdoor' || opening.opening_type === 'overhead_door') {
        const swingRadius = 20;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);

        const swingDirection = opening.swing_direction || 'right';
        
        // Draw door swing arc
        ctx.beginPath();
        if (swingDirection === 'right') {
          ctx.arc(x, y, swingRadius, -Math.PI/2, 0);
          ctx.lineTo(x, y);
        } else if (swingDirection === 'left') {
          ctx.arc(x, y, swingRadius, Math.PI/2, Math.PI);
          ctx.lineTo(x, y);
        } else if (swingDirection === 'in') {
          ctx.arc(x, y, swingRadius, 0, Math.PI/2);
          ctx.lineTo(x, y);
        } else { // out
          ctx.arc(x, y, swingRadius, Math.PI, 3*Math.PI/2);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw label
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 10px sans-serif';
      let label = 'O';
      if (opening.opening_type === 'walkdoor') label = 'D';
      if (opening.opening_type === 'window') label = 'W';
      if (opening.opening_type === 'overhead_door') label = 'OH';
      ctx.fillText(label, x, y + 3);
    });

    // Draw floor drains
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    floorDrains.forEach((drain, index) => {
      let startX = 50 + (width * SCALE * 0.2) + (index * 30);
      let startY = 50 + (length * SCALE * 0.2) + (index * 30);

      if (drain.location.toLowerCase().includes('center')) {
        startX = 50 + (width * SCALE / 2);
        startY = 50 + (length * SCALE / 2);
      }

      if (drain.orientation === 'horizontal') {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + drain.length_ft * SCALE, startY);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX, startY + drain.length_ft * SCALE);
        ctx.stroke();
      }
    });
    ctx.setLineDash([]);
  }

  function getCanvasCoords(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - 50) / SCALE;
    const y = (e.clientY - rect.top - 50) / SCALE;
    return { x, y };
  }

  function findOpeningAtPosition(x: number, y: number): Opening | null {
    for (const opening of openings) {
      if (opening.position_x === undefined || opening.position_y === undefined) continue;
      
      const dx = Math.abs(x - opening.position_x);
      const dy = Math.abs(y - opening.position_y);
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < 1) { // Within 1 foot radius
        return opening;
      }
    }
    return null;
  }

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    if (mode === 'select') {
      const clickedOpening = findOpeningAtPosition(coords.x, coords.y);
      if (clickedOpening) {
        setSelectedOpening(clickedOpening);
        setDraggingOpening(clickedOpening);
      } else {
        setSelectedOpening(null);
      }
    } else if (mode === 'wall') {
      setIsDragging(true);
      setDragStart(coords);
    } else if (mode === 'door' || mode === 'window') {
      // Place door/window at clicked position
      placeOpening(coords.x, coords.y, mode === 'door' ? 'walkdoor' : 'window');
    }
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    if (draggingOpening) {
      setDraggingOpening({
        ...draggingOpening,
        position_x: coords.x,
        position_y: coords.y,
      });
    } else if (isDragging && dragStart && mode === 'wall') {
      drawFloorPlan();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      ctx.strokeStyle = '#1e40af';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(50 + dragStart.x * SCALE, 50 + dragStart.y * SCALE);
      ctx.lineTo(50 + coords.x * SCALE, 50 + coords.y * SCALE);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  async function handleCanvasMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    if (draggingOpening && quoteId) {
      // Update opening position in database
      const { error } = await supabase
        .from('quote_openings')
        .update({
          position_x: coords.x,
          position_y: coords.y,
        })
        .eq('id', draggingOpening.id);

      if (error) {
        console.error('Error updating opening position:', error);
        toast.error('Failed to move opening');
      } else {
        setOpenings(openings.map(o => 
          o.id === draggingOpening.id 
            ? { ...o, position_x: coords.x, position_y: coords.y }
            : o
        ));
        toast.success('Opening moved');
      }
      setDraggingOpening(null);
    } else if (isDragging && dragStart && mode === 'wall' && quoteId) {
      if (Math.abs(coords.x - dragStart.x) < 1 && Math.abs(coords.y - dragStart.y) < 1) {
        setIsDragging(false);
        setDragStart(null);
        return;
      }

      const { data, error } = await supabase
        .from('quote_interior_walls')
        .insert({
          quote_id: quoteId,
          start_x: dragStart.x,
          start_y: dragStart.y,
          end_x: coords.x,
          end_y: coords.y,
        })
        .select()
        .single();

      if (error) {
        toast.error('Failed to add wall');
      } else {
        setWalls([...walls, data]);
        toast.success('Interior wall added');
      }

      setIsDragging(false);
      setDragStart(null);
    }
  }

  async function placeOpening(x: number, y: number, type: 'walkdoor' | 'window') {
    if (!quoteId) {
      toast.error('Save the quote first');
      return;
    }

    setNewOpening({
      opening_type: type,
      size_detail: type === 'walkdoor' ? '3\' × 7\'' : '3\' × 4\'',
      quantity: 1,
      location: '',
      wall: 'front',
      swing_direction: 'right',
    });
    setDragStart({ x, y });
    setShowAddOpening(true);
  }

  async function addOpening() {
    if (!quoteId || !newOpening.size_detail || !dragStart) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('quote_openings')
        .insert({
          quote_id: quoteId,
          ...newOpening,
          position_x: dragStart.x,
          position_y: dragStart.y,
        })
        .select()
        .single();

      if (error) throw error;

      setOpenings([...openings, data]);
      toast.success('Opening added');
      setShowAddOpening(false);
      setNewOpening({
        opening_type: 'walkdoor',
        size_detail: '',
        quantity: 1,
        location: '',
        wall: 'front',
        swing_direction: 'right',
      });
      setDragStart(null);
      setMode('select');
    } catch (error: any) {
      console.error('Error adding opening:', error);
      toast.error('Failed to add opening');
    }
  }

  async function updateOpening() {
    if (!editingOpening) return;

    try {
      const { error } = await supabase
        .from('quote_openings')
        .update({
          size_detail: editingOpening.size_detail,
          quantity: editingOpening.quantity,
          location: editingOpening.location,
          wall: editingOpening.wall,
          swing_direction: editingOpening.swing_direction,
        })
        .eq('id', editingOpening.id);

      if (error) throw error;

      setOpenings(openings.map(o => o.id === editingOpening.id ? editingOpening : o));
      toast.success('Opening updated');
      setShowEditOpening(false);
      setEditingOpening(null);
      setSelectedOpening(null);
    } catch (error: any) {
      console.error('Error updating opening:', error);
      toast.error('Failed to update opening');
    }
  }

  function openEditDialog() {
    if (!selectedOpening) return;
    setEditingOpening(selectedOpening);
    setShowEditOpening(true);
  }

  async function deleteOpening(openingId: string) {
    try {
      const { error } = await supabase
        .from('quote_openings')
        .delete()
        .eq('id', openingId);

      if (error) throw error;

      setOpenings(openings.filter(o => o.id !== openingId));
      setSelectedOpening(null);
      toast.success('Opening deleted');
    } catch (error: any) {
      console.error('Error deleting opening:', error);
      toast.error('Failed to delete opening');
    }
  }

  async function deleteWall(wallId: string) {
    try {
      const { error } = await supabase
        .from('quote_interior_walls')
        .delete()
        .eq('id', wallId);

      if (error) throw error;

      setWalls(walls.filter(w => w.id !== wallId));
      toast.success('Wall deleted');
    } catch (error: any) {
      console.error('Error deleting wall:', error);
      toast.error('Failed to delete wall');
    }
  }

  async function addFloorDrain() {
    if (!quoteId) return;

    try {
      const { data, error } = await supabase
        .from('quote_floor_drains')
        .insert({
          quote_id: quoteId,
          ...newDrain,
        })
        .select()
        .single();

      if (error) throw error;

      setFloorDrains([...floorDrains, data]);
      toast.success('Floor drain added');
      setShowAddDrain(false);
      setNewDrain({
        length_ft: 10,
        orientation: 'horizontal',
        location: '',
      });
    } catch (error: any) {
      console.error('Error adding floor drain:', error);
      toast.error('Failed to add floor drain');
    }
  }

  async function deleteFloorDrain(drainId: string) {
    try {
      const { error } = await supabase
        .from('quote_floor_drains')
        .delete()
        .eq('id', drainId);

      if (error) throw error;

      setFloorDrains(floorDrains.filter(d => d.id !== drainId));
      toast.success('Floor drain deleted');
    } catch (error: any) {
      console.error('Error deleting floor drain:', error);
      toast.error('Failed to delete floor drain');
    }
  }

  async function addCupola() {
    if (!quoteId) return;

    try {
      const { data, error } = await supabase
        .from('quote_cupolas')
        .insert({
          quote_id: quoteId,
          ...newCupola,
        })
        .select()
        .single();

      if (error) throw error;

      setCupolas([...cupolas, data]);
      toast.success('Cupola added');
      setShowAddCupola(false);
      setNewCupola({
        size: '24"x24"',
        cupola_type: 'standard',
        weather_vane: false,
        location: '',
      });
    } catch (error: any) {
      console.error('Error adding cupola:', error);
      toast.error('Failed to add cupola');
    }
  }

  async function deleteCupola(cupolaId: string) {
    try {
      const { error } = await supabase
        .from('quote_cupolas')
        .delete()
        .eq('id', cupolaId);

      if (error) throw error;

      setCupolas(cupolas.filter(c => c.id !== cupolaId));
      toast.success('Cupola deleted');
    } catch (error: any) {
      console.error('Error deleting cupola:', error);
      toast.error('Failed to delete cupola');
    }
  }

  return (
    <div className="space-y-4">
      {/* Mode Selector */}
      <Card className="rounded-none border-2 border-slate-300">
        <CardHeader>
          <CardTitle>Drawing Tools</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={mode === 'select' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('select')}
              className="rounded-none"
            >
              <MousePointer className="w-4 h-4 mr-2" />
              Select/Move
            </Button>
            <Button
              variant={mode === 'wall' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('wall')}
              className="rounded-none"
            >
              <Move className="w-4 h-4 mr-2" />
              Draw Walls
            </Button>
            <Button
              variant={mode === 'door' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('door')}
              className="rounded-none"
            >
              <DoorOpen className="w-4 h-4 mr-2" />
              Place Door
            </Button>
            <Button
              variant={mode === 'window' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('window')}
              className="rounded-none"
            >
              <Square className="w-4 h-4 mr-2" />
              Place Window
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {mode === 'select' && 'Click and drag openings to reposition them'}
            {mode === 'wall' && 'Click and drag to draw interior walls'}
            {mode === 'door' && 'Click to place a door on the floor plan'}
            {mode === 'window' && 'Click to place a window on the floor plan'}
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-none border-2 border-slate-300">
        <CardHeader>
          <CardTitle>Building Layout</CardTitle>
          <p className="text-sm text-muted-foreground">
            {width}' × {length}' • Scale: 1:{SCALE}'
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Canvas */}
          <div className="border rounded-lg overflow-auto bg-white">
            <canvas
              ref={canvasRef}
              className={`${mode === 'wall' ? 'cursor-crosshair' : 'cursor-pointer'}`}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
            />
          </div>

          {/* Selection Actions */}
          {selectedOpening && mode === 'select' && (
            <div className="flex gap-2 p-2 bg-slate-100 rounded">
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {selectedOpening.opening_type === 'walkdoor' && 'Door: '}
                  {selectedOpening.opening_type === 'window' && 'Window: '}
                  {selectedOpening.opening_type === 'overhead_door' && 'Overhead Door: '}
                  {selectedOpening.size_detail}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={openEditDialog}>
                Edit
              </Button>
              <Button size="sm" variant="destructive" onClick={() => deleteOpening(selectedOpening.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Legend */}
          <div className="space-y-2 text-sm">
            <div className="font-semibold">Legend:</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-blue-500"></div>
                <span>Building Outline</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-blue-500"></div>
                <span>Interior Wall</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500"></div>
                <span>Door (D)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500"></div>
                <span>Window (W)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-orange-500"></div>
                <span>Overhead (OH)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 border-t-2 border-dashed border-cyan-500"></div>
                <span>Floor Drain</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for managing items */}
      <Tabs defaultValue="openings" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-white border-2 border-slate-300 rounded-none">
          <TabsTrigger value="openings">Doors & Windows</TabsTrigger>
          <TabsTrigger value="walls">Interior Walls</TabsTrigger>
          <TabsTrigger value="drains">Floor Drains</TabsTrigger>
          <TabsTrigger value="cupolas">Cupolas</TabsTrigger>
        </TabsList>

        <TabsContent value="openings">
          <Card className="rounded-none border-2 border-slate-300">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Doors & Windows</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {openings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No openings added yet. Use the drawing tools above to place doors and windows.
                </p>
              ) : (
                <div className="space-y-2">
                  {openings.map(opening => (
                    <div key={opening.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex-1">
                        <div className="font-medium">
                          {opening.opening_type === 'walkdoor' && 'Door'}
                          {opening.opening_type === 'window' && 'Window'}
                          {opening.opening_type === 'overhead_door' && 'Overhead Door'}
                          {opening.opening_type === 'other' && 'Other Opening'}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {opening.size_detail} • Qty: {opening.quantity}
                          {opening.location && ` • ${opening.location}`}
                          {opening.swing_direction && opening.opening_type !== 'window' && ` • Swing: ${opening.swing_direction}`}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteOpening(opening.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="walls">
          <Card className="rounded-none border-2 border-slate-300">
            <CardHeader>
              <CardTitle>Interior Walls</CardTitle>
            </CardHeader>
            <CardContent>
              {walls.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No interior walls added yet. Use "Draw Walls" mode above.
                </p>
              ) : (
                <div className="space-y-2">
                  {walls.map((wall, index) => (
                    <div key={wall.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex-1">
                        <div className="font-medium">Wall {index + 1}</div>
                        <div className="text-sm text-muted-foreground">
                          From ({wall.start_x.toFixed(1)}', {wall.start_y.toFixed(1)}') to ({wall.end_x.toFixed(1)}', {wall.end_y.toFixed(1)}')
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteWall(wall.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drains">
          <Card className="rounded-none border-2 border-slate-300">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Floor Drains</CardTitle>
                {quoteId && (
                  <Button size="sm" onClick={() => setShowAddDrain(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Drain
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {floorDrains.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No floor drains added yet
                </p>
              ) : (
                <div className="space-y-2">
                  {floorDrains.map(drain => (
                    <div key={drain.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex-1">
                        <div className="font-medium">{drain.length_ft}' {drain.orientation}</div>
                        {drain.location && (
                          <div className="text-sm text-muted-foreground">{drain.location}</div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteFloorDrain(drain.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cupolas">
          <Card className="rounded-none border-2 border-slate-300">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Cupolas</CardTitle>
                {quoteId && (
                  <Button size="sm" onClick={() => setShowAddCupola(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Cupola
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {cupolas.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No cupolas added yet
                </p>
              ) : (
                <div className="space-y-2">
                  {cupolas.map(cupola => (
                    <div key={cupola.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex-1">
                        <div className="font-medium">
                          {cupola.size} {cupola.cupola_type}
                          {cupola.weather_vane && ' • Weather Vane'}
                        </div>
                        {cupola.location && (
                          <div className="text-sm text-muted-foreground">{cupola.location}</div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteCupola(cupola.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Opening Dialog */}
      <Dialog open={showAddOpening} onOpenChange={setShowAddOpening}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {newOpening.opening_type === 'walkdoor' ? 'Door' : 'Window'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Size / Details *</Label>
              <Input
                value={newOpening.size_detail}
                onChange={(e) => setNewOpening({ ...newOpening, size_detail: e.target.value })}
                placeholder="e.g., 3' × 7', 36&quot;x48&quot;"
              />
            </div>
            {newOpening.opening_type !== 'window' && (
              <div className="space-y-2">
                <Label>Door Swing Direction</Label>
                <Select
                  value={newOpening.swing_direction}
                  onValueChange={(value: 'left' | 'right' | 'in' | 'out') => 
                    setNewOpening({ ...newOpening, swing_direction: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="right">Swing Right</SelectItem>
                    <SelectItem value="left">Swing Left</SelectItem>
                    <SelectItem value="in">Swing In</SelectItem>
                    <SelectItem value="out">Swing Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                value={newOpening.quantity}
                onChange={(e) => setNewOpening({ ...newOpening, quantity: Number(e.target.value) })}
                min={1}
              />
            </div>
            <div className="space-y-2">
              <Label>Location Description</Label>
              <Input
                value={newOpening.location}
                onChange={(e) => setNewOpening({ ...newOpening, location: e.target.value })}
                placeholder="e.g., Front wall, East side"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => {
                setShowAddOpening(false);
                setMode('select');
              }}>
                Cancel
              </Button>
              <Button onClick={addOpening}>Add {newOpening.opening_type === 'walkdoor' ? 'Door' : 'Window'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Opening Dialog */}
      <Dialog open={showEditOpening} onOpenChange={setShowEditOpening}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Opening</DialogTitle>
          </DialogHeader>
          {editingOpening && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Size / Details *</Label>
                <Input
                  value={editingOpening.size_detail}
                  onChange={(e) => setEditingOpening({ ...editingOpening, size_detail: e.target.value })}
                />
              </div>
              {editingOpening.opening_type !== 'window' && (
                <div className="space-y-2">
                  <Label>Door Swing Direction</Label>
                  <Select
                    value={editingOpening.swing_direction || 'right'}
                    onValueChange={(value: 'left' | 'right' | 'in' | 'out') => 
                      setEditingOpening({ ...editingOpening, swing_direction: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="right">Swing Right</SelectItem>
                      <SelectItem value="left">Swing Left</SelectItem>
                      <SelectItem value="in">Swing In</SelectItem>
                      <SelectItem value="out">Swing Out</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={editingOpening.quantity}
                  onChange={(e) => setEditingOpening({ ...editingOpening, quantity: Number(e.target.value) })}
                  min={1}
                />
              </div>
              <div className="space-y-2">
                <Label>Location Description</Label>
                <Input
                  value={editingOpening.location}
                  onChange={(e) => setEditingOpening({ ...editingOpening, location: e.target.value })}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowEditOpening(false)}>
                  Cancel
                </Button>
                <Button onClick={updateOpening}>Save Changes</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Floor Drain Dialog */}
      <Dialog open={showAddDrain} onOpenChange={setShowAddDrain}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Floor Drain</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Length (ft)</Label>
              <Input
                type="number"
                value={newDrain.length_ft}
                onChange={(e) => setNewDrain({ ...newDrain, length_ft: Number(e.target.value) })}
                min={1}
              />
            </div>
            <div className="space-y-2">
              <Label>Orientation</Label>
              <Select
                value={newDrain.orientation}
                onValueChange={(value: string) => setNewDrain({ ...newDrain, orientation: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="horizontal">Horizontal</SelectItem>
                  <SelectItem value="vertical">Vertical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input
                value={newDrain.location}
                onChange={(e) => setNewDrain({ ...newDrain, location: e.target.value })}
                placeholder="e.g., Center, North side"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAddDrain(false)}>
                Cancel
              </Button>
              <Button onClick={addFloorDrain}>Add Drain</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Cupola Dialog */}
      <Dialog open={showAddCupola} onOpenChange={setShowAddCupola}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Cupola</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Size</Label>
              <Input
                value={newCupola.size}
                onChange={(e) => setNewCupola({ ...newCupola, size: e.target.value })}
                placeholder="e.g., 24&quot;x24&quot;, 30&quot;x30&quot;"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Input
                value={newCupola.cupola_type}
                onChange={(e) => setNewCupola({ ...newCupola, cupola_type: e.target.value })}
                placeholder="e.g., Standard, Deluxe"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="weather_vane"
                checked={newCupola.weather_vane}
                onChange={(e) => setNewCupola({ ...newCupola, weather_vane: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="weather_vane" className="cursor-pointer">
                Include Weather Vane
              </Label>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input
                value={newCupola.location}
                onChange={(e) => setNewCupola({ ...newCupola, location: e.target.value })}
                placeholder="e.g., Center of roof, Front peak"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAddCupola(false)}>
                Cancel
              </Button>
              <Button onClick={addCupola}>Add Cupola</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
