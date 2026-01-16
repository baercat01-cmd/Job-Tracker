
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
import { Plus, Trash2, Move } from 'lucide-react';
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

const SCALE = 10; // 1 foot = 10 pixels

export function FloorPlanBuilder({ width, length, quoteId }: FloorPlanBuilderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [floorDrains, setFloorDrains] = useState<FloorDrain[]>([]);
  const [cupolas, setCupolas] = useState<Cupola[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [showAddOpening, setShowAddOpening] = useState(false);
  const [showAddDrain, setShowAddDrain] = useState(false);
  const [showAddCupola, setShowAddCupola] = useState(false);
  const [showAddWall, setShowAddWall] = useState(false);

  // New opening form
  const [newOpening, setNewOpening] = useState({
    opening_type: 'walkdoor' as const,
    size_detail: '',
    quantity: 1,
    location: '',
    wall: 'front',
  });

  // New drain form
  const [newDrain, setNewDrain] = useState({
    length_ft: 10,
    orientation: 'horizontal',
    location: '',
  });

  // New cupola form
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
  }, [width, length, walls, openings, floorDrains]); // Added floorDrains to dependencies

  async function loadFloorPlanData() {
    if (!quoteId) return;

    try {
      // Load walls
      const { data: wallsData } = await supabase
        .from('quote_interior_walls')
        .select('*')
        .eq('quote_id', quoteId);
      setWalls(wallsData || []);

      // Load openings
      const { data: openingsData } = await supabase
        .from('quote_openings')
        .select('*')
        .eq('quote_id', quoteId);
      setOpenings(openingsData || []);

      // Load floor drains
      const { data: drainsData } = await supabase
        .from('quote_floor_drains')
        .select('*')
        .eq('quote_id', quoteId);
      setFloorDrains(drainsData || []);

      // Load cupolas
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

    // Set canvas size
    const canvasWidth = width * SCALE + 100;
    const canvasHeight = length * SCALE + 100;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw building outline
    ctx.strokeStyle = '#1e40af'; // Blue
    ctx.lineWidth = 3;
    ctx.strokeRect(50, 50, width * SCALE, length * SCALE);

    // Draw dimensions labels
    ctx.fillStyle = '#000';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';

    // Width label
    ctx.fillText(`${width}' (Width)`, 50 + (width * SCALE) / 2, 35);

    // Length label
    ctx.save();
    ctx.translate(35, 50 + (length * SCALE) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${length}' (Length)`, 0, 0);
    ctx.restore();

    // Scale label
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

    // Draw openings indicators
    openings.forEach(opening => {
      let color = '#10b981'; // Green for walkdoor
      if (opening.opening_type === 'window') color = '#3b82f6'; // Blue
      if (opening.opening_type === 'overhead_door') color = '#f59e0b'; // Orange
      if (opening.opening_type === 'other') color = '#a855f7'; // Purple

      ctx.fillStyle = color;

      // Draw small square indicator
      // Simplified for now, actual placement would need more logic for 'location' or 'wall'
      // This places them arbitrarily based on their index along the top edge for demonstration
      const arbitraryX = 50 + (width * SCALE / (openings.length + 1)) * (openings.indexOf(opening) + 1);
      const arbitraryY = 50; // Top edge for simplicity

      // If position_x/y are defined, use them, otherwise use the arbitrary placement
      const x = opening.position_x !== undefined ? 50 + opening.position_x * SCALE : arbitraryX;
      const y = opening.position_y !== undefined ? 50 + opening.position_y * SCALE : arbitraryY;

      ctx.fillRect(x - 5, y - 5, 10, 10);

      // Draw label
      ctx.fillStyle = '#000';
      ctx.font = '10px sans-serif';
      ctx.fillText(opening.opening_type.charAt(0).toUpperCase(), x - 3, y + 3);
    });

    // Draw floor drains
    ctx.strokeStyle = '#06b6d4'; // Cyan
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    floorDrains.forEach((drain, index) => {
      // For simplicity, placing drains from the left, adjusting for building offset
      const baseX = 50 + 10; // Start 10 pixels in from the left edge of the building
      const baseY = 50 + 10; // Start 10 pixels down from the top edge of the building

      // Calculate position based on index and length to avoid overlap for visualization
      let startX = baseX + (index * 30); // Offset each drain by 30 pixels
      let startY = baseY + (index * 30);

      // Simple placement based on location string or a default
      if (drain.location.toLowerCase().includes('center')) {
        startX = 50 + (width * SCALE / 2);
        startY = 50 + (length * SCALE / 2);
      } else if (drain.location.toLowerCase().includes('north')) {
        startX = 50 + (width * SCALE / 2);
        startY = 50 + (length * SCALE * 0.1);
      } else if (drain.location.toLowerCase().includes('south')) {
        startX = 50 + (width * SCALE / 2);
        startY = 50 + (length * SCALE * 0.9);
      } else if (drain.location.toLowerCase().includes('east')) {
        startX = 50 + (width * SCALE * 0.9);
        startY = 50 + (length * SCALE / 2);
      } else if (drain.location.toLowerCase().includes('west')) {
        startX = 50 + (width * SCALE * 0.1);
        startY = 50 + (length * SCALE / 2);
      }
      // Fallback to indexed placement if no specific location is matched or for visual separation
      // Adjust startX/startY for individual drain placement if specific coordinates are not given
      // For now, we'll keep the previous simple logic for drawing based on orientation
      // Note: A more robust solution would involve proper coordinate calculation based on 'location' string

      if (drain.orientation === 'horizontal') {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + drain.length_ft * SCALE, startY);
        ctx.stroke();
      } else { // vertical
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX, startY + drain.length_ft * SCALE);
        ctx.stroke();
      }
    });
    ctx.setLineDash([]);
  }

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!showAddWall) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - 50) / SCALE;
    const y = (e.clientY - rect.top - 50) / SCALE;

    setIsDragging(true);
    setDragStart({ x, y });
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDragging || !dragStart) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - 50) / SCALE;
    const y = (e.clientY - rect.top - 50) / SCALE;

    // Redraw with temporary line
    drawFloorPlan();

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(50 + dragStart.x * SCALE, 50 + dragStart.y * SCALE);
    ctx.lineTo(50 + x * SCALE, 50 + y * SCALE);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  async function handleCanvasMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDragging || !dragStart) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - 50) / SCALE;
    const y = (e.clientY - rect.top - 50) / SCALE;

    setIsDragging(false);

    // Only save if we have a quote ID and meaningful wall
    if (!quoteId || (Math.abs(x - dragStart.x) < 1 && Math.abs(y - dragStart.y) < 1)) {
      setDragStart(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('quote_interior_walls')
        .insert({
          quote_id: quoteId,
          start_x: dragStart.x,
          start_y: dragStart.y,
          end_x: x,
          end_y: y,
        })
        .select()
        .single();

      if (error) throw error;

      setWalls([...walls, data]);
      toast.success('Interior wall added');
    } catch (error: any) {
      console.error('Error adding wall:', error);
      toast.error('Failed to add wall');
    }

    setDragStart(null);
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

  async function addOpening() {
    if (!quoteId || !newOpening.size_detail) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('quote_openings')
        .insert({
          quote_id: quoteId,
          ...newOpening,
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
      });
    } catch (error: any) {
      console.error('Error adding opening:', error);
      toast.error('Failed to add opening');
    }
  }

  async function deleteOpening(openingId: string) {
    try {
      const { error } = await supabase
        .from('quote_openings')
        .delete()
        .eq('id', openingId);

      if (error) throw error;

      setOpenings(openings.filter(o => o.id !== openingId));
      toast.success('Opening deleted');
    } catch (error: any) {
      console.error('Error deleting opening:', error);
      toast.error('Failed to delete opening');
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
      <Card>
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
              className="cursor-crosshair"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
            />
          </div>

          {/* Add Wall Toggle */}
          {quoteId && (
            <div className="flex items-center gap-2">
              <Button
                variant={showAddWall ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowAddWall(!showAddWall)}
              >
                <Move className="w-4 h-4 mr-2" />
                {showAddWall ? 'Click & Drag to Add Wall' : 'Add Interior Walls'}
              </Button>
              {showAddWall && (
                <p className="text-sm text-muted-foreground">
                  Click and drag on the canvas to draw interior walls
                </p>
              )}
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
                <span>Interior Wall (drag to move)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500"></div>
                <span>Walkdoor (W)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500"></div>
                <span>Window (W)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-orange-500"></div>
                <span>Overhead Door (OH)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-500"></div>
                <span>Other Opening (O)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 border-t-2 border-dashed border-cyan-500"></div>
                <span>Floor Drain</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Doors & Windows */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Doors & Windows</CardTitle>
            {quoteId && (
              <Button size="sm" onClick={() => setShowAddOpening(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Opening
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {openings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No openings added yet
            </p>
          ) : (
            <div className="space-y-2">
              {openings.map(opening => (
                <div key={opening.id} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex-1">
                    <div className="font-medium">
                      {opening.opening_type === 'walkdoor' && 'Walkdoor'}
                      {opening.opening_type === 'window' && 'Window'}
                      {opening.opening_type === 'overhead_door' && 'Overhead Door'}
                      {opening.opening_type === 'other' && 'Other Opening'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {opening.size_detail} • Qty: {opening.quantity}
                      {opening.location && ` • ${opening.location}`}
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

      {/* Floor Drains */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Floor Drains</CardTitle>
            {quoteId && (
              <Button size="sm" onClick={() => setShowAddDrain(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Floor Drain
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

      {/* Cupolas */}
      <Card>
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

      {/* Add Opening Dialog */}
      <Dialog open={showAddOpening} onOpenChange={setShowAddOpening}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Opening</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={newOpening.opening_type}
                onValueChange={(value: 'walkdoor' | 'window' | 'overhead_door' | 'other') => setNewOpening({ ...newOpening, opening_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="walkdoor">Walkdoor</SelectItem>
                  <SelectItem value="window">Window</SelectItem>
                  <SelectItem value="overhead_door">Overhead Door</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Size / Details *</Label>
              <Input
                value={newOpening.size_detail}
                onChange={(e) => setNewOpening({ ...newOpening, size_detail: e.target.value })}
                placeholder="e.g., 3'×7', 36&quot;x48&quot;"
              />
            </div>
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
              <Label>Location</Label>
              <Input
                value={newOpening.location}
                onChange={(e) => setNewOpening({ ...newOpening, location: e.target.value })}
                placeholder="e.g., Front wall, East side"
              />
            </div>
            <div className="space-y-2">
              <Label>Wall</Label>
              <Select
                value={newOpening.wall}
                onValueChange={(value: string) => setNewOpening({ ...newOpening, wall: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="front">Front</SelectItem>
                  <SelectItem value="back">Back</SelectItem>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAddOpening(false)}>
                Cancel
              </Button>
              <Button onClick={addOpening}>Add Opening</Button>
            </div>
          </div>
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
              {/* This is the line identified by the error message.
                  The original code uses a double quote character `"` which might be misinterpreted
                  by some parsers, especially if it's an invisible or non-standard character.
                  Replacing it with a standard ASCII double quote `"` is the fix.
              */}
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
