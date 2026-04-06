import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BuildingEstimator3D from '@/components/office/BuildingEstimator3D';
import { PlanLocalWorkspace } from '@/components/office/PlanLocalWorkspace';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { createDefaultRectPlan, type BuildingPlanModel } from '@/lib/buildingPlanModel';
import { useAuth } from '@/hooks/useAuth';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BuildingModel3D, type VisibilityState } from '@/components/office/BuildingModel3D';
import { planToEstimatorBuildingState } from '@/lib/planToEstimator3D';

function toastPlanRpcError(e: unknown, fallback: string) {
  const msg =
    e && typeof e === 'object' && 'message' in e && typeof (e as { message: string }).message === 'string'
      ? (e as { message: string }).message
      : fallback;
  if (/schema cache|PGRST202|Could not find the function/i.test(msg)) {
    toast.error('Building plan RPCs missing or API cache stale', {
      description:
        'Supabase → SQL: run supabase/migrations/20260327120000_office_building_plan_rpcs.sql on this project, then run select pg_notify(\'pgrst\', \'reload schema\'); confirm VITE_SUPABASE_URL matches that project; hard-refresh.',
    });
    return;
  }
  toast.error(msg);
}

export default function BuildingEstimatorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();

  const quoteId = searchParams.get('quoteId') || undefined;
  const jobId = searchParams.get('jobId') || undefined;
  const forceNew = searchParams.get('new') === '1';
  const width = parseFloat(searchParams.get('width') || '35');
  const length = parseFloat(searchParams.get('length') || '56');
  const height = parseFloat(searchParams.get('height') || '14');
  const pitch = parseFloat(searchParams.get('pitch') || '4');

  const handleEstimateSaved = (estimateData: any) => {
    console.log('Estimate saved:', estimateData);
    // Navigate back to quote or dashboard after save
    if (quoteId) {
      navigate(`/office/quotes?id=${quoteId}`);
    } else if (jobId) {
      navigate('/office/estimator');
    } else {
      navigate('/office');
    }
  };

  // If launched from a Job (jobId) without a quoteId, treat this as "Drawings" mode:
  // open a fresh plan and save it linked to that job.
  const [planId, setPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState<string>('New drawing');
  const [jobInfo, setJobInfo] = useState<{ id: string; name: string | null; quote_number: string | null } | null>(null);
  const [plan, setPlan] = useState<BuildingPlanModel | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<'2d' | '3d'>('3d');
  const [visibility, setVisibility] = useState<VisibilityState>({ frame: true, shell: false, roof: false });
  const [pendingDims, setPendingDims] = useState({ width: 0, length: 0, height: 0, pitch: 0 });
  const planNameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!jobId || quoteId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('jobs')
          .select('id, name, quote_number')
          .eq('id', jobId)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        if (data) {
          setJobInfo({ id: String(data.id), name: (data as any).name ?? null, quote_number: (data as any).quote_number ?? null });
        } else {
          setJobInfo({ id: jobId, name: null, quote_number: null });
        }
      } catch {
        if (!cancelled) setJobInfo({ id: jobId, name: null, quote_number: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, quoteId]);

  const initialPlan = useMemo(
    () =>
      createDefaultRectPlan({
        name: planName || 'Drawing',
        width,
        length,
        height,
        pitch,
      }),
    [width, length, height, pitch, planName]
  );

  useEffect(() => {
    if (!jobId || quoteId) return;
    if (!profile?.id) return;
    let cancelled = false;
    setCreating(true);
    (async () => {
      try {
        if (!forceNew) {
          // Load existing plans first; if none, fall through to blank slate.
          const { data: listData, error: listErr } = await supabase.rpc('office_list_building_plans_for_job', {
            p_job_id: jobId,
          });
          if (listErr) throw listErr;
          let list: any[] = [];
          if (Array.isArray(listData)) list = listData;
          else if (typeof listData === 'string') {
            try { list = JSON.parse(listData); } catch { list = []; }
          } else if (listData && typeof listData === 'object') {
            // jsonb aggregate sometimes returns object-like; ignore.
            list = [];
          }

          if (list.length > 0) {
            const row = list[0];
            if (!row?.id) throw new Error('Plan list returned invalid row');
            if (cancelled) return;
            setPlanId(String(row.id));
            setPlanName(String(row.name || planName));
            setPlan((row.model_json as BuildingPlanModel) || initialPlan);
            toast.success('Loaded latest drawing');
            return;
          }
        }
        // Blank slate: do NOT auto-create a plan/model. User will enter dims/details and click Start drawing.
        if (cancelled) return;
        const base =
          (jobInfo?.name && jobInfo.name.trim()) ? jobInfo.name.trim() :
          (jobInfo?.quote_number ? `Job #${jobInfo.quote_number}` : 'Job');
        setPlanId(null);
        setPlanName(`${base} drawing ${new Date().toLocaleDateString('en-US')}`);
        setPlan(null);
        setPendingDims({ width: 0, length: 0, height: 0, pitch: 0 });
        toast.message(forceNew ? 'Starting a new blank build for this job' : 'Enter building dimensions to start a new drawing');
      } catch (e: any) {
        console.error(e);
        toastPlanRpcError(e, 'Could not start a new drawing');
        if (!cancelled) {
          setPlanId(null);
          setPlanName('New drawing');
          setPlan(initialPlan);
        }
      } finally {
        if (!cancelled) setCreating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, quoteId, profile?.id, initialPlan, jobInfo?.name, jobInfo?.quote_number, forceNew]);

  useEffect(() => {
    if (!jobId || quoteId) return;
    // Focus name field immediately for quick rename.
    const t = window.setTimeout(() => {
      const el = planNameInputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [jobId, quoteId]);

  const savePlan = async () => {
    if (!jobId || quoteId) return;
    if (!profile?.id) {
      toast.error('Not authenticated');
      return;
    }
    if (!planId || !plan) {
      toast.error('No drawing to save');
      return;
    }
    setSaving(true);
    try {
      const next = { ...plan, name: planName };
      const { data, error } = await supabase.rpc('office_update_building_plan', {
        p_plan_id: planId,
        p_model_json: next,
        p_name: planName,
        p_user_id: profile.id,
      });
      if (error) throw error;
      const row = data as any;
      setPlan((row?.model_json as BuildingPlanModel) || next);
      toast.success('Drawing saved');
    } catch (e: any) {
      console.error(e);
      toastPlanRpcError(e, 'Could not save drawing');
    } finally {
      setSaving(false);
    }
  };

  if (jobId && !quoteId) {
    const jobLabel =
      (jobInfo?.name && jobInfo.name.trim())
        ? jobInfo.name.trim()
        : jobInfo?.quote_number
          ? `Job #${jobInfo.quote_number}`
          : 'Job';
    return (
      <div className="h-[100dvh] w-full bg-slate-50">
        <div className="h-full w-full p-0">
          <Card className="h-full w-full rounded-none border-0 shadow-none">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle className="text-base">Drawing for {jobLabel}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Start a fresh plan for this job. Save will attach it to the job.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => navigate('/office/estimator')}>
                    Back
                  </Button>
                  <Button onClick={savePlan} disabled={creating || saving || !planId || !plan}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-[calc(100dvh-64px)] flex flex-col gap-3">
              <div className="space-y-1">
                <div className="text-xs font-medium text-slate-700">Drawing name</div>
                <Input
                  ref={planNameInputRef}
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                />
              </div>
              <div className="relative w-full flex-1 min-h-0 rounded-none sm:rounded-md border bg-white overflow-hidden">
                {plan ? (
                  <div className="absolute inset-0 w-full h-full flex flex-col">
                    <div className="h-10 border-b flex items-center justify-between px-3 bg-white">
                      <div className="flex items-center gap-4 text-xs font-semibold">
                        <button
                          className={activeView === '3d' ? 'text-green-700' : 'text-slate-600 hover:text-slate-900'}
                          onClick={() => setActiveView('3d')}
                        >
                          3D BIM
                        </button>
                        <button
                          className={activeView === '2d' ? 'text-green-700' : 'text-slate-600 hover:text-slate-900'}
                          onClick={() => setActiveView('2d')}
                        >
                          2D Plans
                        </button>
                      </div>
                      {activeView === '3d' ? (
                        <div className="flex items-center gap-2 text-[11px]">
                          <Button size="sm" variant={visibility.shell ? 'default' : 'outline'} onClick={() => setVisibility((p) => ({ ...p, shell: !p.shell }))}>
                            Shell
                          </Button>
                          <Button size="sm" variant={visibility.frame ? 'default' : 'outline'} onClick={() => setVisibility((p) => ({ ...p, frame: !p.frame }))}>
                            Frame
                          </Button>
                          <Button size="sm" variant={visibility.roof ? 'default' : 'outline'} onClick={() => setVisibility((p) => ({ ...p, roof: !p.roof }))}>
                            Roof
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex-1 min-h-0 relative bg-[#eef2f6]">
                      {activeView === '2d' ? (
                        <PlanLocalWorkspace
                          plan={plan}
                          onChange={setPlan}
                          onPersistDrawing={savePlan}
                          persistDrawingDisabled={!planId || !plan || saving || creating}
                          persistDrawingPending={saving}
                        />
                      ) : (
                        <div className="absolute inset-0">
                          <Canvas camera={{ position: [110, 80, 110], fov: 38 }}>
                            <ambientLight intensity={0.75} />
                            <directionalLight position={[50, 100, 50]} intensity={0.8} castShadow />
                            <BuildingModel3D state={planToEstimatorBuildingState(plan)} visibility={visibility} />
                            <OrbitControls enableDamping />
                          </Canvas>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center p-6">
                    <Card className="max-w-xl w-full">
                      <CardHeader>
                        <CardTitle className="text-base">Start a new drawing</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          Enter the building dimensions to initialize the 2D/3D model for this job.
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-slate-700">Width (ft)</div>
                            <Input
                              type="number"
                              value={pendingDims.width}
                              onChange={(e) => setPendingDims((p) => ({ ...p, width: parseFloat(e.target.value) || 0 }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-slate-700">Length (ft)</div>
                            <Input
                              type="number"
                              value={pendingDims.length}
                              onChange={(e) => setPendingDims((p) => ({ ...p, length: parseFloat(e.target.value) || 0 }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-slate-700">Eave height (ft)</div>
                            <Input
                              type="number"
                              value={pendingDims.height}
                              onChange={(e) => setPendingDims((p) => ({ ...p, height: parseFloat(e.target.value) || 0 }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-slate-700">Pitch (in / 12)</div>
                            <Input
                              type="number"
                              value={pendingDims.pitch}
                              onChange={(e) => setPendingDims((p) => ({ ...p, pitch: parseFloat(e.target.value) || 0 }))}
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <Button variant="outline" onClick={() => navigate('/office/estimator')}>
                            Back
                          </Button>
                          <Button
                            disabled={
                              creating ||
                              !profile?.id ||
                              pendingDims.width <= 0 ||
                              pendingDims.length <= 0 ||
                              pendingDims.height <= 0
                            }
                            onClick={async () => {
                              if (!profile?.id) return;
                              setCreating(true);
                              try {
                                const seeded = createDefaultRectPlan({
                                  name: planName || 'Drawing',
                                  width: pendingDims.width,
                                  length: pendingDims.length,
                                  height: pendingDims.height,
                                  pitch: pendingDims.pitch || 0,
                                });
                                const { data, error } = await supabase.rpc('office_create_building_plan', {
                                  p_job_id: jobId,
                                  p_quote_id: null,
                                  p_name: planName,
                                  p_model_json: seeded,
                                  p_user_id: profile.id,
                                });
                                if (error) throw error;
                                const row = data as any;
                                if (!row?.id) throw new Error('Plan create failed');
                                setPlanId(String(row.id));
                                setPlanName(String(row.name || planName));
                                setPlan((row.model_json as BuildingPlanModel) || seeded);
                                toast.success('Drawing started');
                              } catch (e: any) {
                                console.error(e);
                                toastPlanRpcError(e, 'Could not start drawing');
                              } finally {
                                setCreating(false);
                              }
                            }}
                          >
                            {creating ? 'Starting…' : 'Start drawing'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Tip: you can start drawing immediately. Click <strong>Save</strong> to attach this drawing to the job.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <BuildingEstimator3D
      quoteId={quoteId}
      initialWidth={width}
      initialLength={length}
      initialHeight={height}
      initialPitch={pitch}
      onSave={handleEstimateSaved}
    />
  );
}
