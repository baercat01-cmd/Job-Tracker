import { useMemo, useState } from 'react';
import type { BuildingPlanModel, PlanEntityId } from '@/lib/buildingPlanModel';
import { applyOp, type PlanOp } from '@/lib/planOps';
import { Plan2DEditor } from '@/components/plans/Plan2DEditor';
import { PlanElevationPreview } from '@/components/plans/PlanElevationPreview';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ToolMode = 'select' | 'wall' | 'window' | 'door' | 'outlet' | 'drain' | 'room';
type ViewMode = 'floor' | 'Front' | 'Back' | 'Left' | 'Right';

export function PlanLocalWorkspace(props: {
  plan: BuildingPlanModel;
  onChange: (next: BuildingPlanModel) => void;
}) {
  const { plan, onChange } = props;
  const [tool, setTool] = useState<ToolMode>('select');
  const [viewMode, setViewMode] = useState<ViewMode>('floor');
  const [selectedId, setSelectedId] = useState<PlanEntityId | null>(null);
  const [showRoomDialog, setShowRoomDialog] = useState(false);
  const [roomSpec, setRoomSpec] = useState<{ name: string; width: number; depth: number; wallThickness: number }>({
    name: 'Room',
    width: 12,
    depth: 12,
    wallThickness: 0.5 / 12,
  });
  const [showEditRoom, setShowEditRoom] = useState(false);
  const selectedRoom = selectedId ? plan.rooms.find((r) => r.id === selectedId) : null;
  const [showWindowDialog, setShowWindowDialog] = useState(false);
  const [windowSpec, setWindowSpec] = useState<{ label: string; width: number; height: number; sill: number }>({
    label: '4x3',
    width: 4,
    height: 3,
    sill: 3,
  });

  const canDelete = !!selectedId;
  const deleteSelected = () => {
    if (!selectedId) return;
    const id = selectedId;
    let op: PlanOp | null = null;
    if (plan.walls.some((w) => w.id === id)) op = { type: 'delete_wall', wallId: id };
    else if (plan.openings.some((o) => o.id === id)) op = { type: 'delete_opening', openingId: id };
    else if (plan.rooms.some((r) => r.id === id)) op = { type: 'delete_room', roomId: id };
    else if (plan.lofts.some((l) => l.id === id)) op = { type: 'delete_loft', loftId: id };
    else if (plan.fixtures.some((f) => f.id === id)) op = { type: 'delete_fixture', fixtureId: id };
    if (!op) return;
    onChange(applyOp(plan, op));
    setSelectedId(null);
  };

  const onOp = (op: PlanOp) => {
    onChange(applyOp(plan, op));
  };

  const previews = useMemo(() => ['Front', 'Back', 'Left', 'Right'] as const, []);

  return (
    <div className="absolute inset-0 w-full h-full flex flex-col bg-white">
      <div className="h-12 bg-white border-b flex items-center justify-between px-3 gap-2">
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant={tool === 'select' ? 'default' : 'outline'} onClick={() => setTool('select')}>
            Select
          </Button>
          <Button size="sm" variant={tool === 'wall' ? 'default' : 'outline'} onClick={() => setTool('wall')}>
            Wall
          </Button>
          <Button size="sm" variant={tool === 'door' ? 'default' : 'outline'} onClick={() => setTool('door')}>
            Door
          </Button>
          <Button
            size="sm"
            variant={tool === 'window' ? 'default' : 'outline'}
            onClick={() => setShowWindowDialog(true)}
          >
            Window
          </Button>
          <Button size="sm" variant={tool === 'outlet' ? 'default' : 'outline'} onClick={() => setTool('outlet')}>
            Outlet
          </Button>
          <Button size="sm" variant={tool === 'drain' ? 'default' : 'outline'} onClick={() => setTool('drain')}>
            Drain
          </Button>
          <Button
            size="sm"
            variant={tool === 'room' ? 'default' : 'outline'}
            onClick={() => setShowRoomDialog(true)}
          >
            Room
          </Button>
          {tool === 'room' ? (
            <Button size="sm" variant="outline" onClick={() => setTool('select')}>
              Cancel
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={!selectedRoom}
            onClick={() => {
              if (!selectedRoom) return;
              setRoomSpec({
                name: selectedRoom.name ?? 'Room',
                width: selectedRoom.width,
                depth: selectedRoom.depth,
                wallThickness: selectedRoom.wallThickness,
              });
              setShowEditRoom(true);
            }}
          >
            Edit Room
          </Button>
          <Button size="sm" variant="destructive" disabled={!canDelete} onClick={deleteSelected}>
            Delete
          </Button>
        </div>

        <div className="text-xs text-slate-600">
          Tip: right/middle-drag to pan, wheel to zoom. Walls take 2 clicks.
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {viewMode === 'floor' ? (
          <Plan2DEditor
            plan={plan}
            canEdit={true}
            mode={tool}
            roomSpec={tool === 'room' ? roomSpec : null}
            openingSpec={tool === 'window' ? { width: windowSpec.width, height: windowSpec.height, sill: windowSpec.sill } : null}
            orientation="lengthX"
            onCancelPlacement={() => setTool('select')}
            onOp={onOp}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ) : (
          <div className="w-full h-full bg-white p-6">
            <div className="max-w-3xl mx-auto">
              <div className="text-sm font-bold mb-3">{viewMode} elevation</div>
              <div className="aspect-[10/7] border rounded bg-slate-50">
                <PlanElevationPreview plan={plan} side={viewMode} className="w-full h-full" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="h-28 bg-white border-t px-3 py-2 flex items-center gap-2 overflow-x-auto">
        <PreviewButton active={viewMode === 'floor'} label="Floor" onClick={() => setViewMode('floor')}>
          <MiniFloor plan={plan} />
        </PreviewButton>
        {previews.map((side) => (
          <PreviewButton key={side} active={viewMode === side} label={side} onClick={() => setViewMode(side)}>
            <PlanElevationPreview plan={plan} side={side} className="w-full h-full" />
          </PreviewButton>
        ))}
      </div>

      <Dialog open={showRoomDialog} onOpenChange={setShowRoomDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add room</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={roomSpec.name} onChange={(e) => setRoomSpec((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Width (ft)</Label>
                <Input
                  type="number"
                  value={roomSpec.width}
                  onChange={(e) => setRoomSpec((p) => ({ ...p, width: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label className="text-xs">Depth (ft)</Label>
                <Input
                  type="number"
                  value={roomSpec.depth}
                  onChange={(e) => setRoomSpec((p) => ({ ...p, depth: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Wall thickness (inches)</Label>
              <Input
                type="number"
                value={Math.round(roomSpec.wallThickness * 12 * 100) / 100}
                onChange={(e) => {
                  const inches = parseFloat(e.target.value) || 0;
                  setRoomSpec((p) => ({ ...p, wallThickness: inches / 12 }));
                }}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowRoomDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setTool('room');
                  setShowRoomDialog(false);
                }}
              >
                Place on plan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditRoom} onOpenChange={setShowEditRoom}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit room</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={roomSpec.name} onChange={(e) => setRoomSpec((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Width (ft)</Label>
                <Input
                  type="number"
                  value={roomSpec.width}
                  onChange={(e) => setRoomSpec((p) => ({ ...p, width: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label className="text-xs">Depth (ft)</Label>
                <Input
                  type="number"
                  value={roomSpec.depth}
                  onChange={(e) => setRoomSpec((p) => ({ ...p, depth: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Wall thickness (inches)</Label>
              <Input
                type="number"
                value={Math.round(roomSpec.wallThickness * 12 * 100) / 100}
                onChange={(e) => {
                  const inches = parseFloat(e.target.value) || 0;
                  setRoomSpec((p) => ({ ...p, wallThickness: inches / 12 }));
                }}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowEditRoom(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!selectedRoom) return;
                  onChange(
                    applyOp(plan, {
                      type: 'upsert_room',
                      room: {
                        ...selectedRoom,
                        name: roomSpec.name,
                        width: roomSpec.width,
                        depth: roomSpec.depth,
                        wallThickness: roomSpec.wallThickness,
                      },
                    })
                  );
                  setShowEditRoom(false);
                }}
              >
                Save changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showWindowDialog} onOpenChange={setShowWindowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Select window size</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { label: '3x3', width: 3, height: 3, sill: 3 },
                { label: '4x3', width: 4, height: 3, sill: 3 },
                { label: '4x4', width: 4, height: 4, sill: 3 },
                { label: '5x4', width: 5, height: 4, sill: 3 },
                { label: '6x4', width: 6, height: 4, sill: 3 },
                { label: '3x2 (short)', width: 3, height: 2, sill: 4 },
              ].map((p) => (
                <button
                  key={p.label}
                  className={`border rounded px-3 py-2 text-left hover:bg-slate-50 ${
                    windowSpec.label === p.label ? 'border-green-600 ring-2 ring-green-200' : 'border-slate-200'
                  }`}
                  onClick={() => setWindowSpec(p)}
                >
                  <div className="font-semibold text-sm">{p.label}</div>
                  <div className="text-[11px] text-slate-600">
                    {p.width}ft × {p.height}ft · sill {p.sill}ft
                  </div>
                </button>
              ))}
            </div>

            <div className="border-t pt-3">
              <div className="text-xs font-semibold text-slate-700 mb-2">Custom</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Width (ft)</Label>
                  <Input
                    type="number"
                    value={windowSpec.width}
                    onChange={(e) => setWindowSpec((p) => ({ ...p, width: parseFloat(e.target.value) || 0, label: 'Custom' }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Height (ft)</Label>
                  <Input
                    type="number"
                    value={windowSpec.height}
                    onChange={(e) => setWindowSpec((p) => ({ ...p, height: parseFloat(e.target.value) || 0, label: 'Custom' }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Sill (ft)</Label>
                  <Input
                    type="number"
                    value={windowSpec.sill}
                    onChange={(e) => setWindowSpec((p) => ({ ...p, sill: parseFloat(e.target.value) || 0, label: 'Custom' }))}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowWindowDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setTool('window');
                  setShowWindowDialog(false);
                }}
              >
                Place windows
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PreviewButton(props: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { active, label, onClick, children } = props;
  return (
    <button
      onClick={onClick}
      className={`w-28 h-24 rounded border p-1 flex flex-col gap-1 shrink-0 ${
        active ? 'border-green-600 ring-2 ring-green-200' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex-1 rounded bg-white overflow-hidden">{children}</div>
      <div className="text-[10px] font-semibold text-slate-700 text-center">{label}</div>
    </button>
  );
}

function MiniFloor({ plan }: { plan: BuildingPlanModel }) {
  const w = Math.max(1, plan.dims.width);
  const l = Math.max(1, plan.dims.length);
  return (
    <svg viewBox="0 0 100 70" className="w-full h-full">
      <rect x={5} y={5} width={90} height={60} fill="#f8fafc" stroke="#0f172a" strokeWidth={2} />
      {plan.openings.slice(0, 12).map((o) => {
        const wall = plan.walls.find((ww) => ww.id === o.wallId);
        if (!wall) return null;
        const isHorizontal = wall.label === 'Front' || wall.label === 'Back';
        const along = wall.label === 'Front' || wall.label === 'Back' ? w : l;
        const t = along > 0 ? o.offset / along : 0;
        const x = isHorizontal ? 5 + t * 90 : wall.label === 'Left' ? 5 : 95;
        const y = isHorizontal ? (wall.label === 'Front' ? 5 : 65) : 5 + t * 60;
        return <circle key={o.id} cx={x} cy={y} r={3} fill={o.type === 'door' ? '#0284c7' : '#a16207'} opacity={0.8} />;
      })}
    </svg>
  );
}

