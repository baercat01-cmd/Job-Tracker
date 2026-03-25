import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlanShareWorkspace } from '@/components/plans/PlanShareWorkspace';

type SharePayload = {
  plan?: Record<string, unknown>;
  share?: {
    role?: string;
    can_edit?: boolean;
    expires_at?: string | null;
  };
};

function normalizePayload(raw: unknown): SharePayload | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as SharePayload;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as SharePayload;
  return null;
}

export default function PlanShare() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get('token') || '').trim();

  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!token) {
        setErrorMsg('Missing plan token');
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase.rpc('get_building_plan_by_token', { p_token: token });
        if (error) throw error;
        const parsed = normalizePayload(data);
        if (!cancelled) {
          setPayload(parsed);
          setErrorMsg(parsed ? null : 'Invalid plan token');
        }
      } catch (e: any) {
        if (!cancelled) setErrorMsg(e?.message || 'Failed to load plan');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const share = payload?.share;
  const planName = useMemo(() => {
    const n = payload?.plan?.name;
    return typeof n === 'string' && n.trim() ? n : 'Building plan';
  }, [payload]);

  const planId = useMemo(() => {
    const id = payload?.plan?.id;
    return typeof id === 'string' ? id : null;
  }, [payload]);

  const canEdit = share?.can_edit === true;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading plan…</div>;
  }

  if (errorMsg || !payload?.plan) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle>Plan link not available</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{errorMsg || 'Invalid link'}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="font-bold truncate">{planName}</div>
            <div className="text-xs text-muted-foreground truncate">
              Shared plan link
              {share?.expires_at ? ` · expires ${new Date(share.expires_at).toLocaleString()}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={share?.can_edit ? 'default' : 'outline'}>{share?.can_edit ? 'Can edit' : 'View only'}</Badge>
            {share?.role ? <Badge variant="outline">{share.role}</Badge> : null}
          </div>
        </div>
      </header>

      {planId ? (
        <PlanShareWorkspace planId={planId} initialPlanJson={payload.plan?.model_json} token={token} canEdit={canEdit} />
      ) : (
        <main className="max-w-7xl mx-auto px-4 py-6">
          <Card>
            <CardHeader>
              <CardTitle>Plan not found</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">This link is missing the plan id.</CardContent>
          </Card>
        </main>
      )}
    </div>
  );
}

