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
import { Plus, Trash2, Move, MousePointer, DoorOpen, Square, Home, Edit2, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';

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
  rotation?: number; // 0, 90, 180, 270
  width_ft?: number;
  height_ft?: number;
}

interface Room {
  id: string;
  type: 'room' | 'porch' | 'loft';
  x: number;
  y: number;
  width: number;
  length: number;
  rotation: number; // 0, 90, 180, 270
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
const SNAP_THRESHOLD = 1.0; // 1 foot snapping distance

export function FloorPlanBuilder({ width, length, quoteId }: FloorPlanBuilderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [floorDrains, setFloorDrains] = useState<FloorDrain[]>([]);
  const [cupolas, setCupolas] = useState<Cupola[]>([]);
  
  const [mode, setMode] = useState<'select' | 'wall' | 'door' | 'window' | 'overhead' | 'room'>('select');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [selectedOpening, setSelectedOpening] = useState<Opening | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [draggingOpening, setDraggingOpening] = useState<Opening | null>(null);
  const [draggingRoom, setDraggingRoom] = useState<Room | null>(null);
  const [selectedWall, setSelectedWall] = useState<Wall | null>(null);
  const [draggingWallHandle, setDraggingWallHandle] = useState<{ wall: Wall; handleType: 'start' | 'end' } | null>(null);
  const [hoveredItem, setHoveredItem] = useState<{ type: 'opening' | 'wall' | 'handle' | 'room'; id: string; handleType?: 'start' | 'end' } | null>(null);
  const [pendingRoomPlacement, setPendingRoomPlacement] = useState<{
    type: 'room' | 'porch' | 'loft';
    width: number;
    length: number;
  } | null>(null);
  
  const [showAddOpening, setShowAddOpening] = useState(false);
  const [showAddDrain, setShowAddDrain] = useState(false);
  const [showAddCupola, setShowAddCupola] = useState(false);
  const [showEditOpening, setShowEditOpening] = useState(false);
  const [showEditDrain, setShowEditDrain] = useState(false);
  const [showEditCupola, setShowEditCupola] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);
  
  const [newOpening, setNewOpening] = useState({
    opening_type: 'walkdoor' as const,
    size_detail: '',
    quantity: 1,
    location: '',
    wall: 'front',
    swing_direction: 'right' as const,
  });

  const [editingOpening, setEditingOpening] = useState<Opening | null>(null);
  const [editingDrain, setEditingDrain] = useState<FloorDrain | null>(null);
  const [editingCupola, setEditingCupola] = useState<Cupola | null>(null);

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

  const [newRoom, setNewRoom] = useState({
    type: 'room' as 'room' | 'porch' | 'loft',
    width: 10,
    length: 10,
  });

  const [tempIdCounter, setTempIdCounter] = useState(0);

  const generateTempId = () => {
    const id = `temp_${tempIdCounter}`;
    setTempIdCounter(tempIdCounter + 1);
    return id;
  };

  useEffect(() => {
    if (quoteId) {
      loadFloorPlanData();
    }
  }, [quoteId]);

  useEffect(() => {
    drawFloorPlan();
  }, [width, length, walls, openings, rooms, floorDrains, selectedOpening, selectedRoom, selectedWall, draggingOpening, draggingRoom, draggingWallHandle, hoveredItem]);

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

  // Parse opening size from size_detail string (e.g., "3' × 7'" -> {width: 3, height: 7})
  function parseOpeningSize(sizeDetail: string): { width: number; height: number } {
    const match = sizeDetail.match(/(\d+)'?\s*[x×]\s*(\d+)'?/i);
    if (match) {
      return { width: parseFloat(match[1]), height: parseFloat(match[2]) };
    }
    return { width: 3, height: 7 }; // default
  }

  // Snap position to nearest wall
  function snapToWall(x: number, y: number): { x: number; y: number; snapped: boolean } {
    // Check exterior walls first
    const exteriorWalls = [
      { x1: 0, y1: 0, x2: width, y2: 0, type: 'horizontal' }, // top
      { x1: 0, y1: length, x2: width, y2: length, type: 'horizontal' }, // bottom
      { x1: 0, y1: 0, x2: 0, y2: length, type: 'vertical' }, // left
      { x1: width, y1: 0, x2: width, y2: length, type: 'vertical' }, // right
    ];

    for (const wall of exteriorWalls) {
      if (wall.type === 'horizontal') {
        if (Math.abs(y - wall.y1) < SNAP_THRESHOLD && x >= wall.x1 && x <= wall.x2) {
          return { x, y: wall.y1, snapped: true };
        }
      } else {
        if (Math.abs(x - wall.x1) < SNAP_THRESHOLD && y >= wall.y1 && y <= wall.y2) {
          return { x: wall.x1, y, snapped: true };
        }
      }
    }

    // Check interior walls
    for (const wall of walls) {
      const distToLine = pointToLineDistance(x, y, wall.start_x, wall.start_y, wall.end_x, wall.end_y);
      if (distToLine < SNAP_THRESHOLD) {
        const snapped = snapToLine(x, y, wall.start_x, wall.start_y, wall.end_x, wall.end_y);
        return { ...snapped, snapped: true };
      }
    }

    return { x, y, snapped: false };
  }

  function pointToLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function snapToLine(px: number, py: number, x1: number, y1: number, x2: number, y2: number): { x: number; y: number } {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    return { x: xx, y: yy };
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
    ctx.lineWidth = 4;
    ctx.strokeRect(50, 50, width * SCALE, length * SCALE);

    // Draw dimension labels for building
    ctx.fillStyle = '#000';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${width}'`, 50 + (width * SCALE) / 2, 35);

    ctx.save();
    ctx.translate(35, 50 + (length * SCALE) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${length}'`, 0, 0);
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.fillText(`Scale: 1:${SCALE}'`, 10, canvasHeight - 10);

    // Draw rooms
    rooms.forEach(room => {
      const isSelected = selectedRoom?.id === room.id;
      const isDraggingThis = draggingRoom?.id === room.id;
      const isHovered = hoveredItem?.type === 'room' && hoveredItem?.id === room.id;

      const roomX = isDraggingThis ? draggingRoom.x : room.x;
      const roomY = isDraggingThis ? draggingRoom.y : room.y;

      ctx.save();
      ctx.translate(50 + roomX * SCALE, 50 + roomY * SCALE);
      ctx.rotate((room.rotation * Math.PI) / 180);

      // Draw room walls
      ctx.strokeStyle = isSelected || isDraggingThis ? '#ef4444' : isHovered ? '#f59e0b' : '#9333ea';
      ctx.lineWidth = isSelected || isDraggingThis ? 4 : 3;
      ctx.strokeRect(0, 0, room.width * SCALE, room.length * SCALE);

      // Fill with semi-transparent color
      ctx.fillStyle = room.type === 'porch' ? 'rgba(147, 51, 234, 0.1)' : 'rgba(147, 51, 234, 0.05)';
      ctx.fillRect(0, 0, room.width * SCALE, room.length * SCALE);

      // Draw label
      ctx.fillStyle = '#000';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = room.type.charAt(0).toUpperCase() + room.type.slice(1);
      ctx.fillText(label, (room.width * SCALE) / 2, (room.length * SCALE) / 2 - 10);
      ctx.font = '10px sans-serif';
      ctx.fillText(`${room.width}' × ${room.length}'`, (room.width * SCALE) / 2, (room.length * SCALE) / 2 + 5);

      ctx.restore();

      // Draw dimensions if selected
      if (isSelected || isDraggingThis) {
        ctx.strokeStyle = '#ef4444';
        ctx.fillStyle = '#fff';
        ctx.lineWidth = 1;

        // Width dimension
        const midX = 50 + roomX * SCALE + (room.width * SCALE) / 2;
        const topY = 50 + roomY * SCALE - 15;
        const dimWidth = 45;
        const dimHeight = 18;
        ctx.fillRect(midX - dimWidth/2, topY - dimHeight/2, dimWidth, dimHeight);
        ctx.strokeRect(midX - dimWidth/2, topY - dimHeight/2, dimWidth, dimHeight);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${room.width}'`, midX, topY);

        // Length dimension
        const rightX = 50 + roomX * SCALE + room.width * SCALE + 15;
        const midY = 50 + roomY * SCALE + (room.length * SCALE) / 2;
        ctx.fillStyle = '#fff';
        ctx.fillRect(rightX - dimWidth/2, midY - dimHeight/2, dimWidth, dimHeight);
        ctx.strokeRect(rightX - dimWidth/2, midY - dimHeight/2, dimWidth, dimHeight);
        ctx.fillStyle = '#000';
        ctx.fillText(`${room.length}'`, rightX, midY);
      }
    });

    // Draw interior walls with drag handles
    walls.forEach(wall => {
      const isSelected = selectedWall?.id === wall.id;
      const isHovered = hoveredItem?.type === 'wall' && hoveredItem?.id === wall.id;
      const isDragging = draggingWallHandle?.wall.id === wall.id;

      if (isSelected || isHovered || isDragging) {
        ctx.strokeStyle = isSelected || isDragging ? '#ef4444' : '#f59e0b';
        ctx.lineWidth = isSelected || isDragging ? 4 : 3;
      } else {
        ctx.strokeStyle = '#1e40af';
        ctx.lineWidth = 3;
      }

      const startX = isDragging && draggingWallHandle.handleType === 'start' ? draggingWallHandle.wall.start_x : wall.start_x;
      const startY = isDragging && draggingWallHandle.handleType === 'start' ? draggingWallHandle.wall.start_y : wall.start_y;
      const endX = isDragging && draggingWallHandle.handleType === 'end' ? draggingWallHandle.wall.end_x : wall.end_x;
      const endY = isDragging && draggingWallHandle.handleType === 'end' ? draggingWallHandle.wall.end_y : wall.end_y;

      ctx.beginPath();
      ctx.moveTo(50 + startX * SCALE, 50 + startY * SCALE);
      ctx.lineTo(50 + endX * SCALE, 50 + endY * SCALE);
      ctx.stroke();

      if (isSelected || isDragging) {
        const handleSize = 8;
        ctx.fillStyle = hoveredItem?.type === 'handle' && hoveredItem?.handleType === 'start' && hoveredItem?.id === wall.id ? '#fbbf24' : '#ef4444';
        ctx.fillRect(50 + startX * SCALE - handleSize/2, 50 + startY * SCALE - handleSize/2, handleSize, handleSize);
        
        ctx.fillStyle = hoveredItem?.type === 'handle' && hoveredItem?.handleType === 'end' && hoveredItem?.id === wall.id ? '#fbbf24' : '#ef4444';
        ctx.fillRect(50 + endX * SCALE - handleSize/2, 50 + endY * SCALE - handleSize/2, handleSize, handleSize);

        const wallLength = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2)).toFixed(1);
        const midX = 50 + (startX + endX) / 2 * SCALE;
        const midY = 50 + (startY + endY) / 2 * SCALE;
        
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        const labelWidth = 50;
        const labelHeight = 20;
        ctx.fillRect(midX - labelWidth/2, midY - labelHeight/2, labelWidth, labelHeight);
        ctx.strokeRect(midX - labelWidth/2, midY - labelHeight/2, labelWidth, labelHeight);
        
        ctx.fillStyle = '#000';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${wallLength}'`, midX, midY);
      }
    });

    // Draw openings with proper representations
    openings.forEach(opening => {
      const x = opening.position_x !== undefined ? opening.position_x : 0;
      const y = opening.position_y !== undefined ? opening.position_y : 0;
      
      const isSelected = selectedOpening?.id === opening.id;
      const isDraggingThis = draggingOpening?.id === opening.id;
      const isHovered = hoveredItem?.type === 'opening' && hoveredItem?.id === opening.id;

      const posX = isDraggingThis ? draggingOpening!.position_x! : x;
      const posY = isDraggingThis ? draggingOpening!.position_y! : y;

      const canvasX = 50 + posX * SCALE;
      const canvasY = 50 + posY * SCALE;

      const size = parseOpeningSize(opening.size_detail);
      const rotation = opening.rotation || 0;

      let color = '#10b981';
      if (opening.opening_type === 'window') color = '#3b82f6';
      if (opening.opening_type === 'overhead_door') color = '#f59e0b';

      ctx.save();
      ctx.translate(canvasX, canvasY);
      ctx.rotate((rotation * Math.PI) / 180);

      // Draw based on type
      if (opening.opening_type === 'window') {
        // Window: draw a line with width proportional to actual width
        const windowWidth = size.width * SCALE;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-windowWidth / 2, 0);
        ctx.lineTo(windowWidth / 2, 0);
        ctx.stroke();

        // Draw perpendicular markers at ends
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-windowWidth / 2, -4);
        ctx.lineTo(-windowWidth / 2, 4);
        ctx.moveTo(windowWidth / 2, -4);
        ctx.lineTo(windowWidth / 2, 4);
        ctx.stroke();
      } else if (opening.opening_type === 'overhead_door') {
        // Overhead door: similar to window but with dotted line showing open position
        const doorWidth = size.width * SCALE;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-doorWidth / 2, 0);
        ctx.lineTo(doorWidth / 2, 0);
        ctx.stroke();

        // Draw open position (dotted line above/inside)
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = color + '80';
        ctx.beginPath();
        ctx.moveTo(-doorWidth / 2, -size.height * SCALE);
        ctx.lineTo(doorWidth / 2, -size.height * SCALE);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw side markers
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(-doorWidth / 2, 0);
        ctx.lineTo(-doorWidth / 2, -size.height * SCALE);
        ctx.moveTo(doorWidth / 2, 0);
        ctx.lineTo(doorWidth / 2, -size.height * SCALE);
        ctx.stroke();
      } else if (opening.opening_type === 'walkdoor') {
        // Walk door: solid line for door, dotted arc for swing
        const doorWidth = size.width * SCALE;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-doorWidth / 2, 0);
        ctx.lineTo(doorWidth / 2, 0);
        ctx.stroke();

        // Draw door panel (solid line)
        const swingDir = opening.swing_direction || 'right';
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (swingDir === 'right' || swingDir === 'out') {
          ctx.moveTo(doorWidth / 2, 0);
          ctx.lineTo(doorWidth / 2, -doorWidth);
        } else {
          ctx.moveTo(-doorWidth / 2, 0);
          ctx.lineTo(-doorWidth / 2, -doorWidth);
        }
        ctx.stroke();

        // Draw swing arc (dotted)
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = color + '60';
        ctx.beginPath();
        if (swingDir === 'right' || swingDir === 'out') {
          ctx.arc(doorWidth / 2, 0, doorWidth, -Math.PI / 2, 0);
        } else {
          ctx.arc(-doorWidth / 2, 0, doorWidth, -Math.PI / 2, Math.PI, true);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();

      // Draw label and dimensions
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      const labelText = opening.size_detail;
      ctx.font = '11px sans-serif';
      const labelWidth = ctx.measureText(labelText).width + 8;
      const labelHeight = 18;
      const labelX = canvasX;
      const labelY = canvasY - 20;
      
      ctx.fillRect(labelX - labelWidth/2, labelY - labelHeight/2, labelWidth, labelHeight);
      ctx.strokeRect(labelX - labelWidth/2, labelY - labelHeight/2, labelWidth, labelHeight);
      
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, labelX, labelY);

      // Highlight if selected/hovered
      if (isSelected || isDraggingThis || isHovered) {
        ctx.strokeStyle = isSelected || isDraggingThis ? color : color + '80';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        const highlightSize = 25;
        ctx.strokeRect(canvasX - highlightSize, canvasY - highlightSize, highlightSize * 2, highlightSize * 2);
        ctx.setLineDash([]);
      }
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
      
      if (distance < 2) {
        return opening;
      }
    }
    return null;
  }

  function findRoomAtPosition(x: number, y: number): Room | null {
    for (const room of rooms) {
      if (x >= room.x && x <= room.x + room.width && y >= room.y && y <= room.y + room.length) {
        return room;
      }
    }
    return null;
  }

  function findWallAtPosition(x: number, y: number): Wall | null {
    for (const wall of walls) {
      const distance = pointToLineDistance(x, y, wall.start_x, wall.start_y, wall.end_x, wall.end_y);
      if (distance < 0.5) {
        return wall;
      }
    }
    return null;
  }

  function findWallHandleAtPosition(x: number, y: number): { wall: Wall; handleType: 'start' | 'end' } | null {
    for (const wall of walls) {
      if (selectedWall?.id !== wall.id) continue;

      const startDist = Math.sqrt(Math.pow(x - wall.start_x, 2) + Math.pow(y - wall.start_y, 2));
      if (startDist < 0.8) {
        return { wall, handleType: 'start' };
      }

      const endDist = Math.sqrt(Math.pow(x - wall.end_x, 2) + Math.pow(y - wall.end_y, 2));
      if (endDist < 0.8) {
        return { wall, handleType: 'end' };
      }
    }
    return null;
  }

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    if (mode === 'select') {
      if (selectedWall) {
        const handle = findWallHandleAtPosition(coords.x, coords.y);
        if (handle) {
          setDraggingWallHandle(handle);
          return;
        }
      }

      const clickedRoom = findRoomAtPosition(coords.x, coords.y);
      if (clickedRoom) {
        setSelectedRoom(clickedRoom);
        setSelectedOpening(null);
        setSelectedWall(null);
        setDraggingRoom(clickedRoom);
        return;
      }

      const clickedOpening = findOpeningAtPosition(coords.x, coords.y);
      if (clickedOpening) {
        setSelectedOpening(clickedOpening);
        setSelectedRoom(null);
        setSelectedWall(null);
        setDraggingOpening(clickedOpening);
        return;
      }

      const clickedWall = findWallAtPosition(coords.x, coords.y);
      if (clickedWall) {
        setSelectedWall(clickedWall);
        setSelectedOpening(null);
        setSelectedRoom(null);
        return;
      }

      setSelectedOpening(null);
      setSelectedWall(null);
      setSelectedRoom(null);
    } else if (mode === 'wall') {
      setIsDragging(true);
      setDragStart(coords);
    } else if (mode === 'door' || mode === 'window' || mode === 'overhead') {
      const type = mode === 'door' ? 'walkdoor' : mode === 'overhead' ? 'overhead_door' : 'window';
      placeOpening(coords.x, coords.y, type);
    } else if (mode === 'room' && pendingRoomPlacement) {
      placeRoom(coords.x, coords.y);
    }
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    if (mode === 'select' && !draggingOpening && !draggingRoom && !draggingWallHandle) {
      if (selectedWall) {
        const handle = findWallHandleAtPosition(coords.x, coords.y);
        if (handle) {
          setHoveredItem({ type: 'handle', id: handle.wall.id, handleType: handle.handleType });
          return;
        }
      }

      const hoveredRoom = findRoomAtPosition(coords.x, coords.y);
      if (hoveredRoom) {
        setHoveredItem({ type: 'room', id: hoveredRoom.id });
        return;
      }

      const hoveredOpening = findOpeningAtPosition(coords.x, coords.y);
      if (hoveredOpening) {
        setHoveredItem({ type: 'opening', id: hoveredOpening.id });
      } else {
        const hoveredWall = findWallAtPosition(coords.x, coords.y);
        if (hoveredWall) {
          setHoveredItem({ type: 'wall', id: hoveredWall.id });
        } else {
          setHoveredItem(null);
        }
      }
    }

    if (draggingWallHandle) {
      const snapped = snapToWall(coords.x, coords.y);
      const updatedWall = { ...draggingWallHandle.wall };
      if (draggingWallHandle.handleType === 'start') {
        updatedWall.start_x = snapped.x;
        updatedWall.start_y = snapped.y;
      } else {
        updatedWall.end_x = snapped.x;
        updatedWall.end_y = snapped.y;
      }
      setDraggingWallHandle({ ...draggingWallHandle, wall: updatedWall });
    } else if (draggingOpening) {
      const snapped = snapToWall(coords.x, coords.y);
      setDraggingOpening({
        ...draggingOpening,
        position_x: snapped.x,
        position_y: snapped.y,
      });
    } else if (draggingRoom) {
      const snapped = snapToWall(coords.x, coords.y);
      setDraggingRoom({
        ...draggingRoom,
        x: snapped.x,
        y: snapped.y,
      });
    } else if (isDragging && dragStart && mode === 'wall') {
      drawFloorPlan();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      const snapped = snapToWall(coords.x, coords.y);

      ctx.strokeStyle = '#1e40af';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(50 + dragStart.x * SCALE, 50 + dragStart.y * SCALE);
      ctx.lineTo(50 + snapped.x * SCALE, 50 + snapped.y * SCALE);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  async function handleCanvasMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    if (draggingWallHandle) {
      if (quoteId && !draggingWallHandle.wall.id.startsWith('temp_')) {
        const { error } = await supabase
          .from('quote_interior_walls')
          .update({
            start_x: draggingWallHandle.wall.start_x,
            start_y: draggingWallHandle.wall.start_y,
            end_x: draggingWallHandle.wall.end_x,
            end_y: draggingWallHandle.wall.end_y,
          })
          .eq('id', draggingWallHandle.wall.id);

        if (error) {
          console.error('Error updating wall:', error);
          toast.error('Failed to resize wall');
          setDraggingWallHandle(null);
          return;
        }
      }

      setWalls(walls.map(w => w.id === draggingWallHandle.wall.id ? draggingWallHandle.wall : w));
      setSelectedWall(draggingWallHandle.wall);
      toast.success('Wall resized');
      setDraggingWallHandle(null);
    } else if (draggingOpening) {
      const snapped = snapToWall(coords.x, coords.y);
      
      if (quoteId && !draggingOpening.id.startsWith('temp_')) {
        const { error } = await supabase
          .from('quote_openings')
          .update({
            position_x: snapped.x,
            position_y: snapped.y,
          })
          .eq('id', draggingOpening.id);

        if (error) {
          console.error('Error updating opening position:', error);
          toast.error('Failed to move opening');
          setDraggingOpening(null);
          return;
        }
      }

      setOpenings(openings.map(o => o.id === draggingOpening.id ? { ...o, position_x: snapped.x, position_y: snapped.y } : o));
      toast.success(snapped.snapped ? 'Opening moved and snapped to wall' : 'Opening moved');
      setDraggingOpening(null);
    } else if (draggingRoom) {
      const snapped = snapToWall(coords.x, coords.y);
      setRooms(rooms.map(r => r.id === draggingRoom.id ? { ...r, x: snapped.x, y: snapped.y } : r));
      toast.success(snapped.snapped ? 'Room moved and snapped to wall' : 'Room moved');
      setDraggingRoom(null);
    } else if (isDragging && dragStart && mode === 'wall') {
      if (Math.abs(coords.x - dragStart.x) < 1 && Math.abs(coords.y - dragStart.y) < 1) {
        setIsDragging(false);
        setDragStart(null);
        return;
      }

      const snappedStart = snapToWall(dragStart.x, dragStart.y);
      const snappedEnd = snapToWall(coords.x, coords.y);

      if (quoteId) {
        const { data, error } = await supabase
          .from('quote_interior_walls')
          .insert({
            quote_id: quoteId,
            start_x: snappedStart.x,
            start_y: snappedStart.y,
            end_x: snappedEnd.x,
            end_y: snappedEnd.y,
          })
          .select()
          .single();

        if (error) {
          toast.error('Failed to add wall');
        } else {
          setWalls([...walls, data]);
          toast.success('Interior wall added');
        }
      } else {
        const tempWall: Wall = {
          id: generateTempId(),
          start_x: snappedStart.x,
          start_y: snappedStart.y,
          end_x: snappedEnd.x,
          end_y: snappedEnd.y,
        };
        setWalls([...walls, tempWall]);
        toast.success('Wall added (will save when quote is saved)');
      }

      setIsDragging(false);
      setDragStart(null);
    }
  }

  function handleCanvasDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    const clickedOpening = findOpeningAtPosition(coords.x, coords.y);
    if (clickedOpening) {
      setEditingOpening(clickedOpening);
      setShowEditOpening(true);
    }
  }

  async function placeOpening(x: number, y: number, type: 'walkdoor' | 'window' | 'overhead_door') {
    const snapped = snapToWall(x, y);
    
    const defaultSize = type === 'walkdoor' ? "3' × 7'" : type === 'overhead_door' ? "10' × 10'" : "3' × 4'";
    
    if (quoteId) {
      try {
        const { data, error } = await supabase
          .from('quote_openings')
          .insert({
            quote_id: quoteId,
            opening_type: type,
            size_detail: defaultSize,
            quantity: 1,
            location: '',
            wall: 'front',
            swing_direction: 'right',
            position_x: snapped.x,
            position_y: snapped.y,
            rotation: 0,
          })
          .select()
          .single();

        if (error) throw error;

        setOpenings([...openings, data]);
        setSelectedOpening(data);
        toast.success(snapped.snapped ? 'Opening placed and snapped to wall' : 'Opening placed');
      } catch (error: any) {
        console.error('Error adding opening:', error);
        toast.error('Failed to place opening');
        return;
      }
    } else {
      const tempOpening: Opening = {
        id: generateTempId(),
        opening_type: type,
        size_detail: defaultSize,
        quantity: 1,
        location: '',
        wall: 'front',
        swing_direction: 'right',
        position_x: snapped.x,
        position_y: snapped.y,
        rotation: 0,
      };
      setOpenings([...openings, tempOpening]);
      setSelectedOpening(tempOpening);
      toast.success('Opening placed (will save when quote is saved)');
    }

    setMode('select');
  }

  function placeRoom(x: number, y: number) {
    if (!pendingRoomPlacement) return;

    const snapped = snapToWall(x, y);

    const newRoom: Room = {
      id: generateTempId(),
      type: pendingRoomPlacement.type,
      x: snapped.x,
      y: snapped.y,
      width: pendingRoomPlacement.width,
      length: pendingRoomPlacement.length,
      rotation: 0,
    };

    setRooms([...rooms, newRoom]);
    toast.success(`${pendingRoomPlacement.type.charAt(0).toUpperCase() + pendingRoomPlacement.type.slice(1)} placed`);
    setPendingRoomPlacement(null);
    setMode('select');
  }

  function rotateSelectedOpening() {
    if (!selectedOpening) return;
    
    const newRotation = ((selectedOpening.rotation || 0) + 90) % 360;
    const updated = { ...selectedOpening, rotation: newRotation };
    setOpenings(openings.map(o => o.id === selectedOpening.id ? updated : o));
    setSelectedOpening(updated);

    if (quoteId && !selectedOpening.id.startsWith('temp_')) {
      supabase
        .from('quote_openings')
        .update({ rotation: newRotation })
        .eq('id', selectedOpening.id)
        .then(({ error }) => {
          if (error) console.error('Error rotating opening:', error);
        });
    }

    toast.success('Opening rotated');
  }

  function rotateSelectedRoom() {
    if (!selectedRoom) return;
    
    const newRotation = (selectedRoom.rotation + 90) % 360;
    const updated = { ...selectedRoom, rotation: newRotation };
    setRooms(rooms.map(r => r.id === selectedRoom.id ? updated : r));
    setSelectedRoom(updated);

    toast.success('Room rotated');
  }

  async function updateOpening() {
    if (!editingOpening) return;

    if (quoteId && !editingOpening.id.startsWith('temp_')) {
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
      } catch (error: any) {
        console.error('Error updating opening:', error);
        toast.error('Failed to update opening');
        return;
      }
    }

    setOpenings(openings.map(o => o.id === editingOpening.id ? editingOpening : o));
    toast.success('Opening updated');
    setShowEditOpening(false);
    setEditingOpening(null);
    setSelectedOpening(null);
  }

  function openEditDialog() {
    if (!selectedOpening) return;
    setEditingOpening(selectedOpening);
    setShowEditOpening(true);
  }

  function openEditDrainDialog(drain: FloorDrain) {
    setEditingDrain(drain);
    setShowEditDrain(true);
  }

  function openEditCupolaDialog(cupola: Cupola) {
    setEditingCupola(cupola);
    setShowEditCupola(true);
  }

  async function deleteOpening(openingId: string) {
    if (quoteId && !openingId.startsWith('temp_')) {
      try {
        const { error } = await supabase
          .from('quote_openings')
          .delete()
          .eq('id', openingId);

        if (error) throw error;
      } catch (error: any) {
        console.error('Error deleting opening:', error);
        toast.error('Failed to delete opening');
        return;
      }
    }

    setOpenings(openings.filter(o => o.id !== openingId));
    setSelectedOpening(null);
    toast.success('Opening deleted');
  }

  async function deleteRoom(roomId: string) {
    setRooms(rooms.filter(r => r.id !== roomId));
    setSelectedRoom(null);
    toast.success('Room deleted');
  }

  async function deleteWall(wallId: string) {
    if (quoteId && !wallId.startsWith('temp_')) {
      try {
        const { error } = await supabase
          .from('quote_interior_walls')
          .delete()
          .eq('id', wallId);

        if (error) throw error;
      } catch (error: any) {
        console.error('Error deleting wall:', error);
        toast.error('Failed to delete wall');
        return;
      }
    }

    setWalls(walls.filter(w => w.id !== wallId));
    setSelectedWall(null);
    toast.success('Wall deleted');
  }

  async function addFloorDrain() {
    if (!quoteId) {
      toast.error('Please save the quote first before adding floor drains');
      return;
    }

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

  async function updateFloorDrain() {
    if (!editingDrain || !quoteId) return;

    try {
      const { error } = await supabase
        .from('quote_floor_drains')
        .update({
          length_ft: editingDrain.length_ft,
          orientation: editingDrain.orientation,
          location: editingDrain.location,
        })
        .eq('id', editingDrain.id);

      if (error) throw error;

      setFloorDrains(floorDrains.map(d => d.id === editingDrain.id ? editingDrain : d));
      toast.success('Floor drain updated');
      setShowEditDrain(false);
      setEditingDrain(null);
    } catch (error: any) {
      console.error('Error updating floor drain:', error);
      toast.error('Failed to update floor drain');
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
    if (!quoteId) {
      toast.error('Please save the quote first before adding cupolas');
      return;
    }

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

  async function updateCupola() {
    if (!editingCupola || !quoteId) return;

    try {
      const { error } = await supabase
        .from('quote_cupolas')
        .update({
          size: editingCupola.size,
          cupola_type: editingCupola.cupola_type,
          weather_vane: editingCupola.weather_vane,
          location: editingCupola.location,
        })
        .eq('id', editingCupola.id);

      if (error) throw error;

      setCupolas(cupolas.map(c => c.id === editingCupola.id ? editingCupola : c));
      toast.success('Cupola updated');
      setShowEditCupola(false);
      setEditingCupola(null);
    } catch (error: any) {
      console.error('Error updating cupola:', error);
      toast.error('Failed to update cupola');
    }
  }

  async function deleteCupola(cupolaId: string) {
    try {
      const { error} = await supabase
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
            <Button
              variant={mode === 'overhead' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('overhead')}
              className="rounded-none"
            >
              <Square className="w-4 h-4 mr-2" />
              Overhead Door
            </Button>
            <Button
              variant={mode === 'room' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowAddRoom(true)}
              className="rounded-none"
            >
              <Home className="w-4 h-4 mr-2" />
              Add Room/Porch/Loft
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {mode === 'select' && 'Click to select items, drag to reposition (auto-snaps to walls), use buttons to rotate or edit'}
            {mode === 'wall' && 'Click and drag to draw interior walls (auto-snaps to walls)'}
            {mode === 'door' && 'Click to place a walk door (auto-snaps to walls)'}
            {mode === 'window' && 'Click to place a window (auto-snaps to walls)'}
            {mode === 'overhead' && 'Click to place an overhead door (auto-snaps to walls)'}
            {mode === 'room' && pendingRoomPlacement && `Click to place ${pendingRoomPlacement.type} (${pendingRoomPlacement.width}' × ${pendingRoomPlacement.length}') - auto-snaps to walls`}
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-none border-2 border-slate-300">
        <CardHeader>
          <CardTitle>Building Layout</CardTitle>
          <p className="text-sm text-muted-foreground">
            {width}' × {length}' • Scale: 1:{SCALE}' • Items snap to walls automatically
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg overflow-auto bg-white">
            <canvas
              ref={canvasRef}
              className={`${
                mode === 'wall' || mode === 'room' 
                  ? 'cursor-crosshair' 
                  : draggingOpening || draggingRoom || draggingWallHandle
                  ? 'cursor-grabbing'
                  : hoveredItem?.type === 'handle'
                  ? 'cursor-grab'
                  : 'cursor-pointer'
              }`}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onDoubleClick={handleCanvasDoubleClick}
            />
          </div>

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
              <Button size="sm" variant="outline" onClick={rotateSelectedOpening}>
                <RotateCw className="w-4 h-4 mr-1" />
                Rotate
              </Button>
              <Button size="sm" variant="outline" onClick={openEditDialog}>
                <Edit2 className="w-4 h-4 mr-1" />
                Edit
              </Button>
              <Button size="sm" variant="destructive" onClick={() => deleteOpening(selectedOpening.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}

          {selectedRoom && mode === 'select' && (
            <div className="flex gap-2 p-2 bg-purple-50 rounded border border-purple-200">
              <div className="flex-1">
                <p className="text-sm font-medium capitalize">{selectedRoom.type}: {selectedRoom.width}' × {selectedRoom.length}'</p>
                <p className="text-xs text-muted-foreground">Drag to move (snaps to walls), rotate to change orientation</p>
              </div>
              <Button size="sm" variant="outline" onClick={rotateSelectedRoom}>
                <RotateCw className="w-4 h-4 mr-1" />
                Rotate
              </Button>
              <Button size="sm" variant="destructive" onClick={() => deleteRoom(selectedRoom.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}

          {selectedWall && mode === 'select' && (
            <div className="flex gap-2 p-2 bg-red-50 rounded border border-red-200">
              <div className="flex-1">
                <p className="text-sm font-medium">Interior Wall - Drag handles to resize</p>
                <p className="text-xs text-muted-foreground">
                  From ({selectedWall.start_x.toFixed(1)}', {selectedWall.start_y.toFixed(1)}') to ({selectedWall.end_x.toFixed(1)}', {selectedWall.end_y.toFixed(1)}')
                </p>
              </div>
              <Button size="sm" variant="destructive" onClick={() => deleteWall(selectedWall.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}

          <div className="space-y-2 text-sm">
            <div className="font-semibold">Legend:</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-1 bg-blue-700 rounded"></div>
                <span>Building/Interior Wall</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-1 bg-green-500 rounded"></div>
                <span>Walk Door</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-1 bg-blue-500 rounded"></div>
                <span>Window</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-1 bg-orange-500 rounded"></div>
                <span>Overhead Door</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-purple-500 bg-purple-100"></div>
                <span>Room/Porch/Loft</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-1 border-t-2 border-dashed border-cyan-500"></div>
                <span>Floor Drain</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Managing Items */}
      <Tabs defaultValue="openings" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="openings">Doors & Windows</TabsTrigger>
          <TabsTrigger value="rooms">Rooms</TabsTrigger>
          <TabsTrigger value="drains">Floor Drains</TabsTrigger>
          <TabsTrigger value="cupolas">Cupolas</TabsTrigger>
        </TabsList>

        <TabsContent value="openings" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold">Placed Openings</h3>
          </div>
          <div className="space-y-2">
            {openings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No openings placed yet</p>
            ) : (
              openings.map((opening) => (
                <div key={opening.id} className="flex items-center justify-between p-2 border rounded bg-white">
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {opening.opening_type.replace('_', ' ')}: {opening.size_detail}
                      {opening.id.startsWith('temp_') && (
                        <span className="ml-2 text-xs text-orange-600">(unsaved)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Position: ({opening.position_x?.toFixed(1) || '0'}', {opening.position_y?.toFixed(1) || '0'}') • Rotation: {opening.rotation || 0}°
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingOpening(opening);
                        setShowEditOpening(true);
                      }}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteOpening(opening.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="rooms" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold">Rooms/Porches/Lofts</h3>
          </div>
          <div className="space-y-2">
            {rooms.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rooms placed yet</p>
            ) : (
              rooms.map((room) => (
                <div key={room.id} className="flex items-center justify-between p-2 border rounded bg-white">
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {room.type}: {room.width}' × {room.length}'
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Position: ({room.x.toFixed(1)}', {room.y.toFixed(1)}') • Rotation: {room.rotation}°
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteRoom(room.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="drains" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold">Floor Drains</h3>
            <Button size="sm" onClick={() => setShowAddDrain(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Add Drain
            </Button>
          </div>
          <div className="space-y-2">
            {floorDrains.length === 0 ? (
              <p className="text-sm text-muted-foreground">No floor drains added yet</p>
            ) : (
              floorDrains.map((drain) => (
                <div key={drain.id} className="flex items-center justify-between p-2 border rounded bg-white">
                  <div>
                    <p className="text-sm font-medium">
                      {drain.length_ft}' {drain.orientation}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {drain.location || 'Location not specified'}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditDrainDialog(drain)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteFloorDrain(drain.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="cupolas" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold">Cupolas</h3>
            <Button size="sm" onClick={() => setShowAddCupola(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Add Cupola
            </Button>
          </div>
          <div className="space-y-2">
            {cupolas.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cupolas added yet</p>
            ) : (
              cupolas.map((cupola) => (
                <div key={cupola.id} className="flex items-center justify-between p-2 border rounded bg-white">
                  <div>
                    <p className="text-sm font-medium">
                      {cupola.size} - {cupola.cupola_type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cupola.location || 'Location not specified'}
                      {cupola.weather_vane && ' • With Weather Vane'}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditCupolaDialog(cupola)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteCupola(cupola.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Opening Dialog */}
      <Dialog open={showEditOpening} onOpenChange={setShowEditOpening}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Opening</DialogTitle>
          </DialogHeader>
          {editingOpening && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Size/Details</Label>
                <Input
                  value={editingOpening.size_detail}
                  onChange={(e) => setEditingOpening({ ...editingOpening, size_detail: e.target.value })}
                  placeholder="e.g., 3' × 7'"
                />
                <p className="text-xs text-muted-foreground">Format: Width × Height (e.g., "3' × 7'" or "10' × 10'")</p>
              </div>
              <div className="space-y-2">
                <Label>Location Description</Label>
                <Input
                  value={editingOpening.location}
                  onChange={(e) => setEditingOpening({ ...editingOpening, location: e.target.value })}
                  placeholder="e.g., Front wall, center"
                />
              </div>
              {(editingOpening.opening_type === 'walkdoor' || editingOpening.opening_type === 'overhead_door') && (
                <div className="space-y-2">
                  <Label>Swing Direction</Label>
                  <Select
                    value={editingOpening.swing_direction}
                    onValueChange={(value: any) => setEditingOpening({ ...editingOpening, swing_direction: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="right">Right</SelectItem>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="in">In</SelectItem>
                      <SelectItem value="out">Out</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={updateOpening} className="flex-1">
                  Update Opening
                </Button>
                <Button variant="outline" onClick={() => setShowEditOpening(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Room Dialog */}
      <Dialog open={showAddRoom} onOpenChange={setShowAddRoom}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Room/Porch/Loft</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={newRoom.type}
                onValueChange={(value: any) => setNewRoom({ ...newRoom, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="room">Interior Room</SelectItem>
                  <SelectItem value="porch">Porch</SelectItem>
                  <SelectItem value="loft">Loft</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Width (ft)</Label>
              <Input
                type="number"
                value={newRoom.width}
                onChange={(e) => setNewRoom({ ...newRoom, width: Number(e.target.value) })}
                placeholder="10"
              />
            </div>
            <div className="space-y-2">
              <Label>Length (ft)</Label>
              <Input
                type="number"
                value={newRoom.length}
                onChange={(e) => setNewRoom({ ...newRoom, length: Number(e.target.value) })}
                placeholder="10"
              />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <p className="text-sm text-blue-900">
                <strong>Note:</strong> Room size is locked to your specified dimensions. After placing, you can move and rotate it, but the dimensions will remain {newRoom.width}' × {newRoom.length}'.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setPendingRoomPlacement(newRoom);
                  setMode('room');
                  setShowAddRoom(false);
                  toast.info(`Click on the floor plan to place ${newRoom.type} - it will snap to walls`);
                }}
                className="flex-1"
              >
                Place on Floor Plan
              </Button>
              <Button variant="outline" onClick={() => setShowAddRoom(false)}>
                Cancel
              </Button>
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
                placeholder="10"
              />
            </div>
            <div className="space-y-2">
              <Label>Orientation</Label>
              <Select
                value={newDrain.orientation}
                onValueChange={(value) => setNewDrain({ ...newDrain, orientation: value })}
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
                placeholder="e.g., Center of building"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={addFloorDrain} className="flex-1">
                Add Floor Drain
              </Button>
              <Button variant="outline" onClick={() => setShowAddDrain(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Floor Drain Dialog */}
      <Dialog open={showEditDrain} onOpenChange={setShowEditDrain}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Floor Drain</DialogTitle>
          </DialogHeader>
          {editingDrain && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Length (ft)</Label>
                <Input
                  type="number"
                  value={editingDrain.length_ft}
                  onChange={(e) => setEditingDrain({ ...editingDrain, length_ft: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Orientation</Label>
                <Select
                  value={editingDrain.orientation}
                  onValueChange={(value) => setEditingDrain({ ...editingDrain, orientation: value })}
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
                  value={editingDrain.location}
                  onChange={(e) => setEditingDrain({ ...editingDrain, location: e.target.value })}
                  placeholder="e.g., Center of building"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={updateFloorDrain} className="flex-1">
                  Update Floor Drain
                </Button>
                <Button variant="outline" onClick={() => setShowEditDrain(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
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
              <Select
                value={newCupola.size}
                onValueChange={(value) => setNewCupola({ ...newCupola, size: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='18"x18"'>18" × 18"</SelectItem>
                  <SelectItem value='24"x24"'>24" × 24"</SelectItem>
                  <SelectItem value='30"x30"'>30" × 30"</SelectItem>
                  <SelectItem value='36"x36"'>36" × 36"</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Input
                value={newCupola.cupola_type}
                onChange={(e) => setNewCupola({ ...newCupola, cupola_type: e.target.value })}
                placeholder="e.g., Standard, Louvered"
              />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input
                value={newCupola.location}
                onChange={(e) => setNewCupola({ ...newCupola, location: e.target.value })}
                placeholder="e.g., Center of roof"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="weather_vane"
                checked={newCupola.weather_vane}
                onCheckedChange={(checked) => setNewCupola({ ...newCupola, weather_vane: checked as boolean })}
              />
              <Label htmlFor="weather_vane" className="cursor-pointer">
                Include Weather Vane
              </Label>
            </div>
            <div className="flex gap-2">
              <Button onClick={addCupola} className="flex-1">
                Add Cupola
              </Button>
              <Button variant="outline" onClick={() => setShowAddCupola(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Cupola Dialog */}
      <Dialog open={showEditCupola} onOpenChange={setShowEditCupola}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Cupola</DialogTitle>
          </DialogHeader>
          {editingCupola && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Size</Label>
                <Select
                  value={editingCupola.size}
                  onValueChange={(value) => setEditingCupola({ ...editingCupola, size: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='18"x18"'>18" × 18"</SelectItem>
                    <SelectItem value='24"x24"'>24" × 24"</SelectItem>
                    <SelectItem value='30"x30"'>30" × 30"</SelectItem>
                    <SelectItem value='36"x36"'>36" × 36"</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Input
                  value={editingCupola.cupola_type}
                  onChange={(e) => setEditingCupola({ ...editingCupola, cupola_type: e.target.value })}
                  placeholder="e.g., Standard, Louvered"
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={editingCupola.location}
                  onChange={(e) => setEditingCupola({ ...editingCupola, location: e.target.value })}
                  placeholder="e.g., Center of roof"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit_weather_vane"
                  checked={editingCupola.weather_vane}
                  onCheckedChange={(checked) => setEditingCupola({ ...editingCupola, weather_vane: checked as boolean })}
                />
                <Label htmlFor="edit_weather_vane" className="cursor-pointer">
                  Include Weather Vane
                </Label>
              </div>
              <div className="flex gap-2">
                <Button onClick={updateCupola} className="flex-1">
                  Update Cupola
                </Button>
                <Button variant="outline" onClick={() => setShowEditCupola(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
