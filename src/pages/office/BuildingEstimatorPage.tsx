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

export default function BuildingEstimatorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();

  const quoteId = searchParams.get('quoteId') || undefined;
  const jobId = searchParams.get('jobId') || undefined;
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
        const base =
          (jobInfo?.name && jobInfo.name.trim()) ? jobInfo.name.trim() :
          (jobInfo?.quote_number ? `Job #${jobInfo.quote_number}` : 'Job');
        const createdName = `${base} drawing ${new Date().toLocaleDateString('en-US')}`;
        const { data, error } = await supabase.rpc('office_create_building_plan', {
          p_job_id: jobId,
          p_quote_id: null,
          p_name: createdName,
          p_model_json: initialPlan,
          p_user_id: profile.id,
        });
        if (error) throw error;
        const row = data as any;
        if (!row?.id) throw new Error('Plan create failed');
        if (cancelled) return;
        setPlanId(String(row.id));
        setPlanName(String(row.name || createdName));
        setPlan((row.model_json as BuildingPlanModel) || initialPlan);
        toast.success('New drawing started');
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || 'Could not start a new drawing');
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
  }, [jobId, quoteId, profile?.id, initialPlan, jobInfo?.name, jobInfo?.quote_number]);

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
      toast.error(e?.message || 'Could not save drawing');
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
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-slate-700">Drawing name</div>
                  <Input
                    ref={planNameInputRef}
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-slate-700">Linked job</div>
                  <div className="text-xs text-muted-foreground break-all">{jobId}</div>
                </div>
              </div>
              <div className="relative w-full flex-1 min-h-0 rounded-none sm:rounded-md border bg-white overflow-hidden">
                {plan ? (
                  <PlanLocalWorkspace
                    plan={plan}
                    onChange={(next) => {
                      setPlan(next);
                    }}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    {creating ? 'Starting a new drawing…' : 'Loading…'}
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
