import { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Save, FileText, Home } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface BuildingEstimatorProps {
  quoteId?: string;
  initialWidth?: number;
  initialLength?: number;
  initialHeight?: number;
  initialPitch?: number;
  onSave?: (estimateData: any) => void;
}

interface BuildingState {
  width: number;
  length: number;
  height: number;
  pitch: number;
  POST_SPACING: number;
  TRUSS_SPACING: number;
  PURLIN_SPACING: number;
  HEEL_HEIGHT: number;
  OVERHANG: number;
  ACTUAL_POST: number;
  ACTUAL_LUMBER_T: number;
  ACTUAL_LUMBER_W: number;
  ACTUAL_CHORD_W: number;
  ACTUAL_BEARER_W: number;
  BASE_UNIT_COST: number;
}

interface VisibilityState {
  frame: boolean;
  shell: boolean;
  roof: boolean;
}

// Building 3D Component
function Building3D({ state, visibility }: { state: BuildingState; visibility: VisibilityState }) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (groupRef.current) {
      buildModel(groupRef.current, state);
    }
  }, [state]);

  return (
    <group ref={groupRef}>
      {/* Building will be rendered here via buildModel() */}
    </group>
  );
}

function buildModel(group: THREE.Group, state: BuildingState) {
  // Clear existing geometry
  while (group.children.length > 0) {
    group.remove(group.children[0]);
  }

  const w = state.width;
  const l = Math.ceil(state.length / state.POST_SPACING) * state.POST_SPACING;
  const h = state.height;
  const pitch = state.pitch;
  const heel = state.HEEL_HEIGHT;

  const T_p = state.ACTUAL_POST;
  const T_g = state.ACTUAL_LUMBER_T;
  const W_c = state.ACTUAL_CHORD_W;
  const W_b = state.ACTUAL_BEARER_W;
  const SHIFT = T_p / 2;

  const bearerFaceX = (w / 2) - T_g;
  const rafterSpanWidth = bearerFaceX;
  const peakRise = rafterSpanWidth * (pitch / 12);
  const angle = Math.atan(pitch / 12);
  const rLen = rafterSpanWidth / Math.cos(angle);
  const overhangLen = state.OVERHANG / Math.cos(angle);

  const woodMat = new THREE.MeshStandardMaterial({ color: 0xc9b08d });
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 1 });
  const bearerMat = new THREE.MeshStandardMaterial({ color: 0x8b7355 });

  const offsetZ = l / 2;
  const offsetX = w / 2;

  // 1. Slab
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, l), slabMat);
  slab.position.y = -0.25;
  group.add(slab);

  // 2. Sidewall Columns
  const numPostBays = l / state.POST_SPACING;
  for (let i = 0; i <= numPostBays; i++) {
    let z = (i * state.POST_SPACING) - offsetZ;
    if (i === 0) z += SHIFT;
    if (i === numPostBays) z -= SHIFT;

    [-1, 1].forEach(side => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(T_p, h, T_p), woodMat);
      const xPos = (offsetX - T_g - T_p / 2) * side;
      p.position.set(xPos, h / 2, z);
      group.add(p);
    });
  }

  // 3. Truss Bearers
  [-1, 1].forEach(side => {
    const xPostCenter = (offsetX - T_g - T_p / 2) * side;
    const bearerY = h - (W_b / 2);

    const bOut = new THREE.Mesh(new THREE.BoxGeometry(T_g, W_b, l), bearerMat);
    bOut.position.set(xPostCenter + (T_p / 2 + T_g / 2) * side, bearerY, 0);
    group.add(bOut);

    const bIn = new THREE.Mesh(new THREE.BoxGeometry(T_g, W_b, l), bearerMat);
    bIn.position.set(xPostCenter - (T_p / 2 + T_g / 2) * side, bearerY, 0);
    group.add(bIn);
  });

  // 4. Trusses
  const numTrussBays = l / state.TRUSS_SPACING;
  for (let i = 0; i <= numTrussBays; i++) {
    let z = (i * state.TRUSS_SPACING) - offsetZ;
    if (i === 0) z += SHIFT;
    if (i === numTrussBays) z -= SHIFT;

    const truss = new THREE.Group();
    truss.position.set(0, h, z);

    // Bottom Chord
    const bChord = new THREE.Mesh(new THREE.BoxGeometry(w, W_c, T_g), woodMat);
    bChord.position.y = W_c / 2;
    truss.add(bChord);

    // Top Chords (Rafters)
    [-1, 1].forEach(side => {
      const rTotalLen = rLen + overhangLen;
      const rafter = new THREE.Mesh(new THREE.BoxGeometry(rTotalLen, W_c, T_g), woodMat);

      const rX = ((bearerFaceX - (state.OVERHANG)) / 2) * side;
      const rY = heel + (peakRise / 2) + (W_c / 2 * Math.cos(angle));

      rafter.position.set(rX + (state.OVERHANG / 2 * side), rY, 0);
      rafter.rotation.z = angle * -side;
      truss.add(rafter);
    });

    group.add(truss);
  }

  // 5. Endwall Framing
  const numEndPosts = Math.floor(w / state.POST_SPACING);
  const endXPositions: number[] = [];
  for (let k = 1; k <= numEndPosts; k++) {
    const x = (k * state.POST_SPACING) - offsetX;
    if (Math.abs(x) < offsetX - T_g - 1) endXPositions.push(x);
  }

  [-1, 1].forEach(sideZ => {
    const zPosShifted = sideZ < 0 ? (-offsetZ + SHIFT) : (offsetZ - SHIFT);

    endXPositions.forEach(xPos => {
      const distFromBearer = rafterSpanWidth - Math.abs(xPos);
      const roofH = heel + (distFromBearer * (pitch / 12)) + W_c;
      const totalH = h + roofH;

      const ep = new THREE.Mesh(new THREE.BoxGeometry(T_p, totalH, T_p), woodMat);
      ep.position.set(xPos, totalH / 2, zPosShifted);
      ep.rotation.y = Math.PI / 2;
      group.add(ep);
    });

    // Endwall Girts
    const numGirts = Math.floor(h / 2);
    for (let j = 1; j <= numGirts; j++) {
      const y = j * 2;
      if (y >= h - 1.5) continue;

      const eg = new THREE.Mesh(new THREE.BoxGeometry(w, state.ACTUAL_LUMBER_W, T_g), woodMat);
      eg.position.set(0, y, zPosShifted + ((sideZ < 0) ? -T_p / 2 - T_g / 2 : T_p / 2 + T_g / 2));
      group.add(eg);
    }
  });

  // 6. Sidewall Girts
  const numGirtsSide = Math.floor(h / 2);
  for (let j = 1; j <= numGirtsSide; j++) {
    const y = j * 2;
    if (y >= h - 1.5) continue;

    [-1, 1].forEach(side => {
      const g = new THREE.Mesh(new THREE.BoxGeometry(T_g, state.ACTUAL_LUMBER_W, l), woodMat);
      g.position.set((offsetX - T_g / 2) * side, y, 0);
      group.add(g);
    });
  }

  // 7. Roof Purlins
  const numPurlins = Math.floor((rLen + overhangLen) / state.PURLIN_SPACING);
  for (let p = 0; p <= numPurlins; p++) {
    const distFromPeak = p * state.PURLIN_SPACING;

    [-1, 1].forEach(side => {
      const pur = new THREE.Mesh(new THREE.BoxGeometry(state.ACTUAL_LUMBER_W, T_g, l), woodMat);
      const lx = (rafterSpanWidth - state.OVERHANG - (distFromPeak * Math.cos(angle))) * -side;
      const ly = h + heel + ((rafterSpanWidth - (distFromPeak * Math.cos(angle))) * (pitch / 12)) + W_c + T_g / 2;

      pur.position.set(lx, ly, 0);
      pur.rotation.z = angle * side;
      group.add(pur);
    });
  }
}

export default function BuildingEstimator3D({
  quoteId,
  initialWidth = 35,
  initialLength = 56,
  initialHeight = 14,
  initialPitch = 4,
  onSave
}: BuildingEstimatorProps) {
  const [state, setState] = useState<BuildingState>({
    width: initialWidth,
    length: initialLength,
    height: initialHeight,
    pitch: initialPitch,
    POST_SPACING: 8,
    TRUSS_SPACING: 4,
    PURLIN_SPACING: 2,
    HEEL_HEIGHT: 0.5,
    OVERHANG: 1.5,
    ACTUAL_POST: 0.458,
    ACTUAL_LUMBER_T: 0.125,
    ACTUAL_LUMBER_W: 0.292,
    ACTUAL_CHORD_W: 0.458,
    ACTUAL_BEARER_W: 0.771,
    BASE_UNIT_COST: 78.50
  });

  const [visibility, setVisibility] = useState<VisibilityState>({
    frame: true,
    shell: false,
    roof: false
  });

  const [activeTab, setActiveTab] = useState('3d');
  const [saving, setSaving] = useState(false);

  // Calculate materials
  const calculateMaterials = () => {
    const actualLen = Math.ceil(state.length / state.POST_SPACING) * state.POST_SPACING;
    const numTrusses = actualLen / state.TRUSS_SPACING + 1;
    const numColumns = (actualLen / 8 + 1) * 2 + 6;
    const numGirtSets = Math.floor(state.height / 2) * 4;

    return {
      columns: numColumns,
      trusses: numTrusses,
      girtSets: numGirtSets,
      actualLength: actualLen
    };
  };

  const materials = calculateMaterials();

  // Calculate price
  const calculatePrice = () => {
    const area = state.width * materials.actualLength;
    return (area * state.BASE_UNIT_COST) + (state.height * 1650);
  };

  const price = calculatePrice();

  // Save estimate to database
  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const estimateData = {
        quote_id: quoteId || null,
        width: state.width,
        length: state.length,
        height: state.height,
        pitch: state.pitch,
        post_spacing: state.POST_SPACING,
        truss_spacing: state.TRUSS_SPACING,
        purlin_spacing: state.PURLIN_SPACING,
        heel_height: state.HEEL_HEIGHT,
        overhang: state.OVERHANG,
        model_data: state,
        calculated_materials: materials,
        estimated_cost: price,
        base_unit_cost: state.BASE_UNIT_COST,
        created_by: user.id
      };

      const { error } = await supabase
        .from('building_estimates')
        .insert(estimateData);

      if (error) throw error;

      toast.success('Building estimate saved successfully!');
      if (onSave) onSave(estimateData);
    } catch (error: any) {
      console.error('Error saving estimate:', error);
      toast.error(error.message || 'Failed to save estimate');
    } finally {
      setSaving(false);
    }
  };

  const chartData = {
    labels: ['Columns', 'Trusses (4\' OC)', 'Girt Sets'],
    datasets: [{
      data: [materials.columns, materials.trusses, materials.girtSets],
      backgroundColor: ['#4179bc', '#f59e0b', '#10b981'],
      borderRadius: 4
    }]
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#4179bc] text-white h-14 flex items-center px-4 justify-between shadow-md border-b border-black/10">
        <div className="flex items-center gap-4">
          <Button variant="secondary" size="sm" className="gap-2">
            <Home className="w-4 h-4" />
            Home
          </Button>
          <div className="border-l border-white/30 pl-4">
            <div className="text-[10px] opacity-80 uppercase leading-none tracking-tight font-bold text-white/70">
              Building Estimator
            </div>
            <div className="text-sm font-semibold italic">3D Configuration</div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-[10px] opacity-80 uppercase leading-none font-bold text-white/70">
              Estimated Price
            </div>
            <div className="text-xl font-bold text-[#ffd100] tracking-tighter">
              ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <FileText className="w-4 h-4" />
              Make Quote
            </Button>
            <Button variant="secondary" size="sm" className="gap-2" onClick={handleSave} disabled={saving}>
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center Viewport */}
        <div className="flex-1 flex flex-col bg-white relative">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b">
              <TabsTrigger value="3d">3D View</TabsTrigger>
              <TabsTrigger value="review">Job Review</TabsTrigger>
            </TabsList>

            <TabsContent value="3d" className="flex-1 m-0 relative">
              <Canvas camera={{ position: [70, 50, 70], fov: 45 }}>
                <ambientLight intensity={0.7} />
                <directionalLight position={[100, 200, 100]} intensity={0.8} castShadow />
                <Building3D state={state} visibility={visibility} />
                <OrbitControls target={[0, 5, 0]} enableDamping />
              </Canvas>

              {/* HUD */}
              <div className="absolute top-4 left-4 bg-white/95 backdrop-blur p-3 rounded border border-slate-200 shadow-sm pointer-events-none">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                  Live Structure
                </div>
                <div className="text-xs font-semibold text-slate-700">
                  {state.width}' x {materials.actualLength}' x {state.height}' Post-Frame
                </div>
                <div className="mt-2 flex gap-2">
                  <span className="text-[9px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded border border-blue-200 font-bold tracking-tighter italic">
                    Width: Outside Girt
                  </span>
                  <span className="text-[9px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded border border-orange-200 font-bold tracking-tighter italic">
                    Heel: 6" Vertical
                  </span>
                </div>
              </div>

              {/* Visibility Controls */}
              <div className="absolute bottom-0 left-0 w-full bg-[#4179bc] h-10 flex items-center px-4 gap-2">
                <span className="text-[9px] text-white font-bold uppercase mr-4 tracking-widest">
                  Visibility:
                </span>
                <Button
                  size="sm"
                  variant={visibility.shell ? "secondary" : "ghost"}
                  onClick={() => setVisibility(prev => ({ ...prev, shell: !prev.shell }))}
                  className="text-[10px]"
                >
                  Shell
                </Button>
                <Button
                  size="sm"
                  variant={visibility.frame ? "secondary" : "ghost"}
                  onClick={() => setVisibility(prev => ({ ...prev, frame: !prev.frame }))}
                  className="text-[10px]"
                >
                  Frame
                </Button>
                <Button
                  size="sm"
                  variant={visibility.roof ? "secondary" : "ghost"}
                  onClick={() => setVisibility(prev => ({ ...prev, roof: !prev.roof }))}
                  className="text-[10px]"
                >
                  Roof
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="review" className="flex-1 m-0 p-8 overflow-y-auto bg-slate-50">
              <div className="max-w-4xl mx-auto space-y-6">
                <Card className="p-6">
                  <h2 className="text-sm font-bold uppercase text-slate-500 mb-4 tracking-widest">
                    Structural Material Analysis
                  </h2>
                  <div className="h-[300px]">
                    <Bar
                      data={chartData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } }
                      }}
                    />
                  </div>
                </Card>

                {/* Material Breakdown */}
                <Card className="p-6">
                  <h2 className="text-sm font-bold uppercase text-slate-500 mb-4 tracking-widest">
                    Material Breakdown
                  </h2>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-2 border-b">
                      <span className="font-semibold">Columns (Posts)</span>
                      <span>{materials.columns} units</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="font-semibold">Trusses (4' OC)</span>
                      <span>{materials.trusses} units</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="font-semibold">Girt Sets</span>
                      <span>{materials.girtSets} units</span>
                    </div>
                    <div className="flex justify-between py-2 pt-4 font-bold text-base">
                      <span>Total Estimated Cost</span>
                      <span className="text-green-600">
                        ${price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Sidebar - Configuration */}
        <aside className="w-80 bg-slate-100 border-l border-slate-200 overflow-y-auto">
          <div className="border-b border-slate-200">
            <div className="bg-[#4179bc] text-white px-3 py-2 text-xs font-bold">
              Building Size
            </div>
            <div className="p-4 space-y-4 bg-white">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[11px] text-slate-500 font-bold uppercase italic">
                  Reference Width
                </Label>
                <span className="text-[10px] bg-blue-50 px-2 py-1 rounded font-bold text-blue-600 border border-blue-100">
                  Outside Girt
                </span>
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] text-slate-500 font-bold uppercase">
                  Building Width (ft)
                </Label>
                <Input
                  type="number"
                  value={state.width}
                  onChange={(e) => setState(prev => ({ ...prev, width: parseFloat(e.target.value) || 0 }))}
                  className="text-right font-mono font-bold"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] text-slate-500 font-bold uppercase">
                  Building Length (ft)
                </Label>
                <Input
                  type="number"
                  value={state.length}
                  onChange={(e) => setState(prev => ({ ...prev, length: parseFloat(e.target.value) || 0 }))}
                  className="text-right font-mono font-bold"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] text-slate-500 font-bold uppercase">
                  Ceiling Height (ft)
                </Label>
                <Input
                  type="number"
                  value={state.height}
                  onChange={(e) => setState(prev => ({ ...prev, height: parseFloat(e.target.value) || 0 }))}
                  className="text-right font-mono font-bold"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] text-slate-500 font-bold uppercase">
                  Roof Pitch (x/12)
                </Label>
                <Input
                  type="number"
                  value={state.pitch}
                  onChange={(e) => setState(prev => ({ ...prev, pitch: parseFloat(e.target.value) || 0 }))}
                  className="text-right font-mono font-bold"
                />
              </div>
            </div>
          </div>

          {/* Engineering Details */}
          <div className="border-b border-slate-200">
            <div className="bg-slate-200 text-slate-700 px-3 py-2 text-[10px] font-black uppercase tracking-widest">
              Engineering Details
            </div>
            <div className="p-3 bg-white text-[10px] text-slate-500 font-mono space-y-2">
              <div className="flex justify-between items-start">
                <span>Truss Chords:</span>
                <span className="text-blue-600 font-bold text-right uppercase">2x6 Material</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-1">
                <span>Heel Datum:</span>
                <span className="text-green-600 font-bold text-right uppercase">Outside Bearer</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-1">
                <span>Overhang:</span>
                <span className="text-slate-800 font-bold text-right">1.5' Rafter Tail</span>
              </div>
            </div>
          </div>

          {/* System Info */}
          <div className="mt-auto p-4 border-t border-slate-200 bg-slate-50">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                Geometric Solver
              </span>
              <span className="bg-green-500 w-2 h-2 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)] animate-pulse"></span>
            </div>
            <div className="text-[9px] text-slate-400 leading-tight italic">
              Width: Outside of Girt. Chords: 2x6. 6" Heel @ Bearer Face.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
