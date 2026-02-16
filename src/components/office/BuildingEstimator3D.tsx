import { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Save, FileText, Home, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Material Catalog with SKUs and Pricing
const CATALOG = {
  POST: { sku: "6616-TRT", desc: "6x6x16 Treated Structural Post", priceEA: 92.50 },
  BEARER: { sku: "L21016", desc: "2x10 Southern Yellow Pine Header", priceEA: 34.40 },
  LUMBER: { sku: "L2416", desc: "2x4 Wall/Roof Framing Stock", priceEA: 15.20 },
  SKIRT: { sku: "L2616-SK", desc: "2x6 Treated Ground Skirt Board", priceEA: 29.60 },
  WINDOW: { sku: "WIN-GEN", desc: "Vinyl Glass Opening Unit", priceEA: 245.00 },
  FASCIA: { sku: "L2616-TRM", desc: "2x6 Primed Select Trim Fascia", priceEA: 26.40 },
  METAL: { sku: "MS-29GA", desc: "29ga Painted Steel Sheeting", priceLF: 4.85 }
};

interface BuildingEstimatorProps {
  quoteId?: string;
  initialWidth?: number;
  initialLength?: number;
  initialHeight?: number;
  initialPitch?: number;
  onSave?: (estimateData: any) => void;
}

interface Opening {
  id: number;
  wall: 'Front' | 'Back' | 'Left' | 'Right';
  offset: number;
  elev: number;
  w: number;
  h: number;
}

interface BuildingState {
  width: number;
  length: number;
  height: number;
  pitch: number;
  openings: Opening[];
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
      buildModel(groupRef.current, state, visibility);
    }
  }, [state, visibility]);

  return <group ref={groupRef} />;
}

function buildModel(group: THREE.Group, state: BuildingState, visibility: VisibilityState) {
  // Clear existing geometry
  while (group.children.length > 0) {
    group.remove(group.children[0]);
  }

  const w = state.width;
  const l = Math.ceil(state.length / 8) * 8;
  const h = state.height;
  const pitch = state.pitch;
  const angle = Math.atan(pitch / 12);
  const peakH = (w / 2) * (pitch / 12);

  // Physical Constants
  const heel = 0.5; // 6 inches
  const eaveOverhang = 1.5;
  const gableOverhang = 1.5;
  const Tp = 0.4583; // 6x6 post
  const Tg = 0.125; // 1.5" girt
  const Wc = 0.4583; // 2x6 chord (5.5")
  const vertChordDepth = Wc / Math.cos(angle);

  const frameX = (w / 2) - Tg;
  const rafterSpanWidth = frameX;

  // Materials
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xc4a484 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xa5f3fc, transparent: true, opacity: 0.5 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 });
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });

  // 1. Slab
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, l), slabMat);
  slab.position.y = -0.25;
  group.add(slab);

  const offsetZ = l / 2;

  // 2. Sidewall Posts (8' OC)
  if (visibility.frame) {
    const nB = l / 8;
    for (let i = 0; i <= nB; i++) {
      let z = (i * 8) - offsetZ;
      if (i === 0) z += (Tp / 2 + Tg);
      if (i === nB) z -= (Tp / 2 + Tg);
      [-1, 1].forEach(side => {
        const postH = h + heel + vertChordDepth;
        const p = new THREE.Mesh(new THREE.BoxGeometry(Tp, postH, Tp), woodMat);
        p.position.set((frameX - Tp / 2) * side, postH / 2, z);
        group.add(p);
      });
    }
  }

  // 3. Endwall Posts
  if (visibility.frame) {
    for (let x = 8; x < w - 1; x += 8) {
      const posX = x - w / 2;
      [-1, 1].forEach(sideZ => {
        const run = frameX - Math.abs(posX);
        const epTop = h + heel + (run * Math.tan(angle)) + vertChordDepth;
        const ep = new THREE.Mesh(new THREE.BoxGeometry(Tp, epTop, Tp), woodMat);
        const zPos = (offsetZ - Tg - Tp / 2) * sideZ;
        ep.position.set(posX, epTop / 2, zPos);
        ep.rotation.y = Math.PI / 2;
        group.add(ep);
      });
    }
  }

  // 4. Truss Carrier Headers
  if (visibility.frame) {
    [-1, 1].forEach(side => {
      const bLen = l + 2 * Tg;
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(Tg, 0.77, bLen), woodMat);
      b1.position.set(frameX * side, h - 0.385, 0);
      group.add(b1);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(Tg, 0.77, bLen), woodMat);
      b2.position.set((frameX - Tp - Tg) * side, h - 0.385, 0);
      group.add(b2);
    });
  }

  // 5. Trusses (4' OC)
  if (visibility.frame) {
    for (let t = 0; t <= l; t += 4) {
      let z = t - offsetZ;
      if (t === 0) z = -offsetZ + Tg / 2;
      else if (t === l) z = offsetZ - Tg / 2;
      else if (t % 8 === 0) z += (Tp / 2 + Tg / 2);

      const truss = new THREE.Group();
      truss.position.set(0, h, z);

      // Bottom Chord
      const bc = new THREE.Mesh(new THREE.BoxGeometry(frameX * 2, Wc, Tg), woodMat);
      bc.position.y = Wc / 2;
      truss.add(bc);

      // Top Chords (Rafters)
      const totalRun = frameX + eaveOverhang;
      [-1, 1].forEach(side => {
        const shape = new THREE.Shape();
        const ridgeY = heel + (frameX * Math.tan(angle));
        const tailY = ridgeY - (totalRun * Math.tan(angle));

        shape.moveTo(0, ridgeY + vertChordDepth);
        shape.lineTo(totalRun, tailY + vertChordDepth);
        shape.lineTo(totalRun, tailY);
        shape.lineTo(0, ridgeY);
        shape.lineTo(0, ridgeY + vertChordDepth);

        const rGeom = new THREE.ExtrudeGeometry(shape, { depth: Tg, bevelEnabled: false });
        const r = new THREE.Mesh(rGeom, woodMat);
        if (side === 1) r.position.set(0, 0, -Tg / 2);
        else { r.position.set(0, 0, Tg / 2); r.scale.x = -1; }
        truss.add(r);
      });

      group.add(truss);
    }
  }

  // 6. Roof Purlins (2' OC)
  const peakTopSurfaceY = h + heel + vertChordDepth + (frameX * Math.tan(angle));
  if (visibility.frame) {
    const pLen = l + (gableOverhang * 2) + (2 * Tg);
    for (let dist = 0.5; dist < (frameX + eaveOverhang - 0.2); dist += 2) {
      [-1, 1].forEach(side => {
        const pur = new THREE.Mesh(new THREE.BoxGeometry(0.292, Tg, pLen), woodMat);
        const py = peakTopSurfaceY - (dist * Math.tan(angle)) + (Tg / 2 / Math.cos(angle));
        pur.position.set(dist * side, py, 0);
        pur.rotation.z = angle * -side;
        group.add(pur);
      });
    }
  }

  // 7. Windows & Framing
  if (visibility.frame) {
    state.openings.forEach(op => {
      const opG = new THREE.Group();
      opG.add(new THREE.Mesh(new THREE.BoxGeometry(op.w, op.h, 0.2), glassMat));

      const fD = 0.292;
      const header = new THREE.Mesh(new THREE.BoxGeometry(op.w + 2 * Tg, fD, Tg), woodMat);
      header.position.set(0, op.h / 2 + fD / 2, 0);
      opG.add(header);

      const sill = new THREE.Mesh(new THREE.BoxGeometry(op.w + 2 * Tg, fD, Tg), woodMat);
      sill.position.set(0, -op.h / 2 - fD / 2, 0);
      opG.add(sill);

      [-1, 1].forEach(s => {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(Tg, op.h, fD), woodMat);
        jamb.position.set((op.w / 2 + Tg / 2) * s, 0, 0);
        opG.add(jamb);
      });

      let px = 0, pz = 0, ry = 0;
      if (op.wall === 'Front') { pz = -l / 2 - Tg / 2; px = -w / 2 + op.offset + op.w / 2; }
      else if (op.wall === 'Back') { pz = l / 2 + Tg / 2; px = -w / 2 + op.offset + op.w / 2; }
      else if (op.wall === 'Left') { px = -w / 2 - Tg / 2; pz = -l / 2 + op.offset + op.w / 2; ry = Math.PI / 2; }
      else if (op.wall === 'Right') { px = w / 2 + Tg / 2; pz = -l / 2 + op.offset + op.w / 2; ry = Math.PI / 2; }

      opG.position.set(px, op.elev + op.h / 2, pz);
      opG.rotation.y = ry;
      group.add(opG);
    });
  }

  // 8. Wall Girts
  if (visibility.frame) {
    for (let gy = 2; gy < h; gy += 2) {
      [-1, 1].forEach(sx => {
        const g = new THREE.Mesh(new THREE.BoxGeometry(Tg, 0.292, l), woodMat);
        g.position.set((w / 2 - Tg / 2) * sx, gy, 0);
        group.add(g);
      });
      [-1, 1].forEach(sz => {
        const g = new THREE.Mesh(new THREE.BoxGeometry(w, 0.292, Tg), woodMat);
        g.position.set(0, gy, (l / 2 - Tg / 2) * sz);
        group.add(g);
      });
    }
  }

  // 9. Fascia (Fixed Alignment)
  if (visibility.frame) {
    const fasciaFullLen = l + (gableOverhang * 2) + (2 * Tg);
    const purlinVertOffset = Tg / Math.cos(angle);

    [-1, 1].forEach(side => {
      const eaveF = new THREE.Mesh(new THREE.BoxGeometry(Tg, Wc, fasciaFullLen), woodMat);
      const xF = (frameX + eaveOverhang + Tg / 2) * side;
      const eaveRafterTopYAtEnd = h + heel + vertChordDepth - (eaveOverhang * Math.tan(angle));
      eaveF.position.set(xF, eaveRafterTopYAtEnd - Wc / 2, 0);
      group.add(eaveF);
    });

    const rakeLen = (w / 2 + eaveOverhang) / Math.cos(angle);
    [-1, 1].forEach(sideZ => {
      const zPos = (l / 2 + gableOverhang + Tg / 2) * sideZ;
      [-1, 1].forEach(sideX => {
        const rakeF = new THREE.Mesh(new THREE.BoxGeometry(rakeLen, Wc, Tg), woodMat);
        const mx = ((w / 2 + eaveOverhang) / 2) * sideX;
        const rakePurlinTopY = peakTopSurfaceY - (Math.abs(mx) * Math.tan(angle)) + purlinVertOffset;
        rakeF.position.set(mx, rakePurlinTopY - (Wc / 2) * Math.cos(angle), zPos);
        rakeF.rotation.z = angle * -sideX;
        group.add(rakeF);
      });
    });
  }

  // 10. Sheeting (Shell)
  if (visibility.shell) {
    [-1, 1].forEach(sz => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), metalMat);
      wall.position.set(0, h / 2, (l / 2) * sz);
      group.add(wall);
      const gable = new THREE.Mesh(new THREE.CylinderGeometry(0, w / 2, peakH, 3), metalMat);
      gable.position.set(0, h + peakH / 2, (l / 2) * sz);
      gable.rotation.z = Math.PI;
      group.add(gable);
    });
    [-1, 1].forEach(sx => {
      const sidewall = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, l), metalMat);
      sidewall.position.set((w / 2) * sx, h / 2, 0);
      group.add(sidewall);
    });
  }

  // 11. Roof Sheeting
  if (visibility.roof) {
    const slopeLen = Math.sqrt(Math.pow(w / 2, 2) + Math.pow(peakH, 2)) + eaveOverhang;
    [-1, 1].forEach(side => {
      const r = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.1, l + (gableOverhang * 2)), metalMat);
      r.position.set((slopeLen / 2 - (eaveOverhang / 2)) * side, h + peakH / 2 + 0.6, 0);
      r.rotation.z = angle * -side;
      group.add(r);
    });
  }
}

export function BuildingEstimator3D({
  quoteId,
  initialWidth = 35,
  initialLength = 56,
  initialHeight = 14,
  initialPitch = 4,
  onSave
}: BuildingEstimatorProps) {
  const navigate = useNavigate();
  const [state, setState] = useState<BuildingState>({
    width: initialWidth,
    length: initialLength,
    height: initialHeight,
    pitch: initialPitch,
    openings: []
  });

  const [visibility, setVisibility] = useState<VisibilityState>({
    frame: true,
    shell: false,
    roof: false
  });

  const [activeTab, setActiveTab] = useState('3d');
  const [saving, setSaving] = useState(false);

  // Window form state
  const [windowForm, setWindowForm] = useState({
    wall: 'Front' as 'Front' | 'Back' | 'Left' | 'Right',
    offset: 8,
    elev: 3,
    w: 4,
    h: 3
  });

  // Add window
  const addWindow = () => {
    setState(prev => ({
      ...prev,
      openings: [...prev.openings, {
        id: Date.now(),
        wall: windowForm.wall,
        offset: windowForm.offset,
        elev: windowForm.elev,
        w: windowForm.w,
        h: windowForm.h
      }]
    }));
    toast.success('Window added to building');
  };

  // Remove opening
  const removeOpening = (id: number) => {
    setState(prev => ({
      ...prev,
      openings: prev.openings.filter(o => o.id !== id)
    }));
    toast.success('Window removed');
  };

  // Calculate materials and pricing
  const syncProject = () => {
    const l = Math.ceil(state.length / 8) * 8;
    const waste = 1.10;
    
    const numPosts = ((l / 8) + 1) * 2;
    const lumberPieces = Math.ceil(((state.width * l * 3.5) / 16) + (state.openings.length * 4));
    const wallArea = ((state.width * 2 + l * 2) * state.height) + (state.width * ((state.width / 2) * (state.pitch / 12)));
    const roofArea = (Math.sqrt(Math.pow(state.width / 2, 2) + Math.pow((state.width / 2) * (state.pitch / 12), 2)) * 2) * l;
    const totalArea = wallArea + roofArea;
    const metalPanels = Math.ceil(totalArea / 30);

    const fasciaLF = (l * 2) + (state.width * 2);
    const fasciaPcs = Math.ceil((fasciaLF * waste) / 16);

    const lines = [
      { id: "Structural", spec: "6x6 Treated Posts", sku: CATALOG.POST.sku, qty: numPosts, price: CATALOG.POST.priceEA },
      { id: "Framing", spec: "Wall/Roof Stock (16')", sku: CATALOG.LUMBER.sku, qty: lumberPieces, price: CATALOG.LUMBER.priceEA },
      { id: "Trim", spec: "2x6 Fascia Pieces", sku: CATALOG.FASCIA.sku, qty: fasciaPcs, price: CATALOG.FASCIA.priceEA },
      { id: "Sheeting", spec: "29ga Metal Sheeting", sku: CATALOG.METAL.sku, qty: metalPanels, price: CATALOG.METAL.priceLF * 10 },
      { id: "Openings", spec: "Assigned Windows", sku: CATALOG.WINDOW.sku, qty: state.openings.length, price: CATALOG.WINDOW.priceEA }
    ];

    const total = lines.reduce((sum, line) => sum + (line.qty * line.price), 0);

    return { lines, total, numPosts, lumberPieces };
  };

  const { lines, total, numPosts, lumberPieces } = syncProject();

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
        model_data: { ...state, visibility },
        calculated_materials: { lines, total },
        estimated_cost: total,
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

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <header className="bg-mb-dark-blue text-white h-14 flex items-center px-4 justify-between shadow-lg shrink-0 font-mono text-xs border-b border-white/10">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-mb-success rounded flex items-center justify-center font-bold text-sm shadow-inner border border-white/10">
            SF
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight uppercase leading-none">
              SmartBuild <span className="text-mb-success">BIM</span>
            </h1>
            <div className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mt-1">
              Fascia Cap Alignment V11.7
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="text-right">
            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter italic">
              Piece-Based Valuation
            </div>
            <div className="text-lg font-bold text-mb-yellow leading-tight">
              ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="h-8 w-px bg-slate-700"></div>
          <div className="flex gap-2 text-[10px] font-bold uppercase">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/office?tab=quotes')}
              className="border border-slate-600 hover:bg-slate-800"
            >
              <Home className="w-3 h-3 mr-1" />
              Back
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-mb-success hover:bg-green-500 text-white shadow-sm"
            >
              <Save className="w-3 h-3 mr-1" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center Viewport */}
        <main className="flex-1 flex flex-col bg-white relative">
          {/* Navigation */}
          <div className="h-10 border-b border-slate-200 flex items-center justify-between px-4 bg-white font-mono text-[11px] shrink-0">
            <div className="flex gap-8 h-full">
              <button
                className={`px-1 transition-all ${activeTab === '3d' ? 'text-mb-success border-b-2 border-mb-success font-bold' : 'text-slate-600 hover:text-mb-success'}`}
                onClick={() => setActiveTab('3d')}
              >
                3D Building View
              </button>
              <button
                className={`px-1 transition-all ${activeTab === 'catalog' ? 'text-mb-success border-b-2 border-mb-success font-bold' : 'text-slate-600 hover:text-mb-success'}`}
                onClick={() => setActiveTab('catalog')}
              >
                Inventory Reference
              </button>
              <button
                className={`px-1 transition-all ${activeTab === 'review' ? 'text-mb-success border-b-2 border-mb-success font-bold' : 'text-slate-600 hover:text-mb-success'}`}
                onClick={() => setActiveTab('review')}
              >
                Job Review
              </button>
            </div>
          </div>

          <div className="relative flex-1 overflow-hidden bg-[#eef2f6]">
            {/* 3D View */}
            {activeTab === '3d' && (
              <div className="absolute inset-0 w-full h-full flex flex-col">
                <div className="flex-1">
                  <Canvas camera={{ position: [110, 80, 110], fov: 38 }}>
                    <ambientLight intensity={0.75} />
                    <directionalLight position={[50, 100, 50]} intensity={0.8} castShadow />
                    <Building3D state={state} visibility={visibility} />
                    <OrbitControls enableDamping />
                  </Canvas>
                </div>

                {/* HUD */}
                <div className="absolute top-4 left-4 pointer-events-none">
                  <div className="bg-slate-900/90 text-white p-4 rounded-xl shadow-2xl border border-white/10 space-y-2 w-56">
                    <div className="text-[10px] font-black text-mb-success uppercase tracking-widest font-mono">
                      Structural Resolution
                    </div>
                    <div className="space-y-1 font-mono text-[11px] opacity-90">
                      <div className="flex justify-between gap-12">
                        <span>Posts:</span>
                        <span className="font-bold text-white uppercase">6x6 S4S</span>
                      </div>
                      <div className="flex justify-between gap-12 text-mb-success">
                        <span>Fascia:</span>
                        <span className="font-bold uppercase tracking-tighter italic">Purlin Capped</span>
                      </div>
                      <div className="flex justify-between gap-12">
                        <span>Openings:</span>
                        <span className="font-bold text-mb-yellow">{state.openings.length}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Visibility Toggles */}
                <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-2 p-1.5 bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/10">
                  <button
                    onClick={() => setVisibility(prev => ({ ...prev, shell: !prev.shell }))}
                    className={`px-5 py-2 text-[10px] font-bold rounded-xl uppercase transition-all shadow-sm border ${
                      visibility.shell
                        ? 'bg-mb-success text-white border-green-700'
                        : 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    Shell
                  </button>
                  <button
                    onClick={() => setVisibility(prev => ({ ...prev, frame: !prev.frame }))}
                    className={`px-5 py-2 text-[10px] font-bold rounded-xl uppercase transition-all shadow-sm border ${
                      visibility.frame
                        ? 'bg-mb-success text-white border-green-700'
                        : 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    Frame
                  </button>
                  <button
                    onClick={() => setVisibility(prev => ({ ...prev, roof: !prev.roof }))}
                    className={`px-5 py-2 text-[10px] font-bold rounded-xl uppercase transition-all shadow-sm border ${
                      visibility.roof
                        ? 'bg-mb-success text-white border-green-700'
                        : 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    Roof
                  </button>
                </div>
              </div>
            )}

            {/* Catalog View */}
            {activeTab === 'catalog' && (
              <div className="absolute inset-0 w-full h-full bg-slate-50 p-8 overflow-y-auto">
                <div className="max-w-6xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                  <h2 className="text-sm font-black text-slate-800 uppercase mb-4 font-mono underline decoration-mb-success underline-offset-8">
                    Master Material Database
                  </h2>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-slate-400 font-bold">SKU Identifier</th>
                        <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-slate-400 font-bold">Catalog Description</th>
                        <th className="px-4 py-3 text-right text-[10px] uppercase tracking-widest text-slate-400 font-bold">Price</th>
                        <th className="px-4 py-3 text-center text-[10px] uppercase tracking-widest text-slate-400 font-bold">Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(CATALOG).map(([key, item]) => (
                        <tr key={key} className="hover:bg-slate-50 transition-colors border-b border-slate-50">
                          <td className="px-4 py-3 text-[11px] text-mb-blue font-bold font-mono">{item.sku}</td>
                          <td className="px-4 py-3 text-[11px] text-slate-700 font-mono">{item.desc}</td>
                          <td className="px-4 py-3 text-right text-[11px] text-slate-800 font-bold font-mono">
                            ${('priceEA' in item ? item.priceEA : item.priceLF * 16).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center text-[9px] text-slate-500 uppercase font-mono">EA</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Review View (BOM) */}
            {activeTab === 'review' && (
              <div className="absolute inset-0 w-full h-full bg-slate-50 p-8 overflow-y-auto">
                <div className="max-w-5xl mx-auto space-y-6">
                  <div className="bg-mb-success p-8 rounded-2xl shadow-xl text-white flex justify-between items-center overflow-hidden relative">
                    <div className="z-10 text-left">
                      <div className="text-[10px] font-bold opacity-60 uppercase tracking-widest mb-1">
                        Assigned Project Total
                      </div>
                      <div className="text-5xl font-black">
                        ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="text-right font-mono italic text-[11px] opacity-80 uppercase tracking-widest leading-none z-10">
                      Capped-Fascia<br />BIM Synthesis
                    </div>
                    <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-green-500 rounded-full opacity-20 blur-3xl"></div>
                  </div>

                  <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 font-mono underline decoration-slate-200 underline-offset-8">
                      Purchasing Bill of Materials
                    </h3>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-slate-400 font-bold">Component</th>
                          <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-slate-400 font-bold">Material Specs & SKU</th>
                          <th className="px-4 py-3 text-center text-[10px] uppercase tracking-widest text-slate-400 font-bold">Piece Qty</th>
                          <th className="px-4 py-3 text-right text-[10px] uppercase tracking-widest text-slate-400 font-bold">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, idx) => {
                          const sub = line.qty * line.price;
                          return (
                            <tr key={idx} className="border-b border-slate-50">
                              <td className="px-4 py-3 font-bold text-slate-400 text-[9px] uppercase">{line.id}</td>
                              <td className="px-4 py-3">
                                <div className="font-bold text-slate-800 text-[11px]">{line.spec}</div>
                                <div className="text-[9px] opacity-60 font-mono">{line.sku}</div>
                              </td>
                              <td className="px-4 py-3 text-center font-bold text-[11px]">{line.qty} EA</td>
                              <td className="px-4 py-3 text-right text-mb-success font-bold text-[11px]">
                                ${sub.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Right Sidebar */}
        <aside className="w-80 bg-white flex flex-col shrink-0 overflow-y-auto font-mono border-l border-slate-200">
          <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0">
            <h2 className="text-xs font-black text-slate-700 uppercase tracking-widest italic">Dimensions</h2>
          </div>

          <div className="p-5 space-y-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-bold text-slate-400 uppercase">Width</Label>
              <Input
                type="number"
                value={state.width}
                onChange={(e) => setState(prev => ({ ...prev, width: parseFloat(e.target.value) || 0 }))}
                className="w-24 text-right font-bold text-slate-700"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-bold text-slate-400 uppercase">Length</Label>
              <Input
                type="number"
                value={state.length}
                onChange={(e) => setState(prev => ({ ...prev, length: parseFloat(e.target.value) || 0 }))}
                className="w-24 text-right font-bold text-slate-700"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-bold text-slate-400 uppercase">Eave Ht</Label>
              <Input
                type="number"
                value={state.height}
                onChange={(e) => setState(prev => ({ ...prev, height: parseFloat(e.target.value) || 0 }))}
                className="w-24 text-right font-bold text-slate-700"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-bold text-mb-blue uppercase italic">Pitch</Label>
              <Input
                type="number"
                value={state.pitch}
                onChange={(e) => setState(prev => ({ ...prev, pitch: parseFloat(e.target.value) || 0 }))}
                className="w-24 text-right font-bold text-mb-blue border-blue-100 bg-blue-50/20"
              />
            </div>
          </div>

          <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0">
            <h2 className="text-xs font-black text-slate-700 uppercase tracking-widest flex justify-between items-center italic">
              <span>Add Windows</span>
              <span className="text-mb-success text-lg leading-none">&#65291;</span>
            </h2>
          </div>

          <div className="p-5 space-y-4 border-b border-slate-100 bg-white text-xs">
            <div>
              <Label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-widest">Select Wall</Label>
              <Select
                value={windowForm.wall}
                onValueChange={(value: any) => setWindowForm(prev => ({ ...prev, wall: value }))}
              >
                <SelectTrigger className="w-full bg-slate-50 border-slate-200 text-[11px] font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Front">Front Wall (Z-)</SelectItem>
                  <SelectItem value="Back">Back Wall (Z+)</SelectItem>
                  <SelectItem value="Left">Left Wall (X-)</SelectItem>
                  <SelectItem value="Right">Right Wall (X+)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Offset (ft)</Label>
                <Input
                  type="number"
                  value={windowForm.offset}
                  onChange={(e) => setWindowForm(prev => ({ ...prev, offset: parseFloat(e.target.value) || 0 }))}
                  className="w-full text-left"
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Height (ft)</Label>
                <Input
                  type="number"
                  value={windowForm.elev}
                  onChange={(e) => setWindowForm(prev => ({ ...prev, elev: parseFloat(e.target.value) || 0 }))}
                  className="w-full text-left"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Width (ft)</Label>
                <Input
                  type="number"
                  value={windowForm.w}
                  onChange={(e) => setWindowForm(prev => ({ ...prev, w: parseFloat(e.target.value) || 0 }))}
                  className="w-full text-left"
                />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Height (ft)</Label>
                <Input
                  type="number"
                  value={windowForm.h}
                  onChange={(e) => setWindowForm(prev => ({ ...prev, h: parseFloat(e.target.value) || 0 }))}
                  className="w-full text-left"
                />
              </div>
            </div>
            <Button
              onClick={addWindow}
              className="bg-mb-success hover:bg-green-500 text-white py-2 text-[10px] font-bold uppercase tracking-widest w-full shadow-sm"
            >
              Add to Model
            </Button>
          </div>

          <div className="p-4 flex-grow overflow-y-auto">
            <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3 italic">Active Features</h3>
            {state.openings.map(o => (
              <div key={o.id} className="bg-slate-50 border border-slate-200 rounded p-2 mb-2 flex justify-between items-center text-[10px] font-mono shadow-sm">
                <div>
                  <span className="font-bold text-slate-800 uppercase tracking-tighter">{o.w}'x{o.h}' Window</span>
                  <br />
                  {o.wall} @ {o.offset}' Offset
                </div>
                <button onClick={() => removeOpening(o.id)} className="text-rose-400 hover:text-rose-600 font-bold">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-auto bg-slate-900 p-6 text-white border-t border-white/5 font-mono shrink-0">
            <ul className="space-y-2 text-[10px] opacity-80">
              <li className="flex justify-between">
                <span>Structural Posts:</span>
                <span className="text-mb-yellow font-bold">{numPosts}</span>
              </li>
              <li className="flex justify-between">
                <span>Lumber Piece Tally:</span>
                <span className="text-mb-yellow font-bold">{lumberPieces + numPosts}</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
