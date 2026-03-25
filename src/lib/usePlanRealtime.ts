import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { BuildingPlanModel } from '@/lib/buildingPlanModel';
import { applyOp, newOpId, type PlanActorId, type PlanOp, type PlanWireMessage } from '@/lib/planOps';

type PlanShareInfo = {
  token?: string;
  canEdit: boolean;
};

type PresenceState = {
  actorId: string;
  onlineAt: number;
  name?: string;
};

export function usePlanRealtime(opts: {
  planId: string;
  initialPlan: BuildingPlanModel;
  share: PlanShareInfo;
}) {
  const { planId, initialPlan, share } = opts;
  const [plan, setPlan] = useState<BuildingPlanModel>(initialPlan);
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState<PresenceState[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);

  const actorId: PlanActorId = useMemo(() => {
    // Keep stable across rerenders for this hook instance.
    return `actor_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }, []);

  const seenOpIdsRef = useRef<Set<string>>(new Set());
  const persistTimerRef = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const schedulePersist = useCallback(
    (nextPlan: BuildingPlanModel) => {
      if (!share.canEdit) return;
      if (!share.token) return;
      if (persistTimerRef.current != null) {
        window.clearTimeout(persistTimerRef.current);
      }
      persistTimerRef.current = window.setTimeout(async () => {
        persistTimerRef.current = null;
        setSaving(true);
        setLastSaveError(null);
        try {
          await supabase.rpc('update_building_plan_by_token', {
            p_token: share.token,
            p_model_json: nextPlan,
            p_name: nextPlan.name,
          });
          setLastSavedAt(Date.now());
        } catch {
          // Non-fatal; realtime keeps working and user can refresh.
          setLastSaveError('Could not save. Changes are still live but may not persist if you refresh.');
        } finally {
          setSaving(false);
        }
      }, 650);
    },
    [share.canEdit, share.token]
  );

  const sendOp = useCallback(
    async (op: PlanOp) => {
      const msg: PlanWireMessage = { opId: newOpId(), actorId, ts: Date.now(), op };
      // Apply locally first for snappy UX.
      setPlan((prev) => {
        const next = applyOp(prev, op);
        schedulePersist(next);
        return next;
      });
      seenOpIdsRef.current.add(msg.opId);
      const ch = channelRef.current;
      if (!ch) return;
      // Broadcast best-effort; local state already updated.
      void ch.send({ type: 'broadcast', event: 'op', payload: msg });
    },
    [actorId, schedulePersist]
  );

  useEffect(() => {
    const channel = supabase.channel(`plan:${planId}`, {
      config: {
        presence: { key: actorId },
      },
    });
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'op' }, (payload) => {
        const msg = payload.payload as PlanWireMessage | undefined;
        if (!msg || !msg.opId || !msg.op) return;
        if (msg.actorId === actorId) return;
        if (seenOpIdsRef.current.has(msg.opId)) return;
        seenOpIdsRef.current.add(msg.opId);
        setPlan((prev) => applyOp(prev, msg.op));
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<string, PresenceState[]>;
        const flat = Object.values(state).flat();
        setPresence(flat);
      })
      .on('presence', { event: 'join' }, () => {
        const state = channel.presenceState() as Record<string, PresenceState[]>;
        const flat = Object.values(state).flat();
        setPresence(flat);
      })
      .on('presence', { event: 'leave' }, () => {
        const state = channel.presenceState() as Record<string, PresenceState[]>;
        const flat = Object.values(state).flat();
        setPresence(flat);
      });

    channel.subscribe(async (status) => {
      setConnected(status === 'SUBSCRIBED');
      if (status !== 'SUBSCRIBED') return;
      await channel.track({ actorId, onlineAt: Date.now() });
    });

    return () => {
      if (persistTimerRef.current != null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      try {
        supabase.removeChannel(channel);
      } finally {
        channelRef.current = null;
      }
    };
  }, [actorId, planId]);

  return {
    actorId,
    plan,
    setPlan,
    sendOp,
    connected,
    presence,
    saving,
    lastSavedAt,
    lastSaveError,
  };
}

