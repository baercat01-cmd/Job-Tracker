import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

type InsertRow = Record<string, unknown>;

function isOptionalColumnErr(msg: string): boolean {
  return /can_edit_schedule|can_view_proposal|can_view_materials|column|schema|PGRST204/i.test(msg);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ ok: false, error: 'Server misconfigured' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? '');
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    if (action === 'insert') {
      const row = body?.payload as InsertRow | undefined;
      if (!row?.portal_user_id || !row?.job_id) {
        return new Response(JSON.stringify({ ok: false, error: 'Missing portal_user_id or job_id' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let ins = await admin.from('portal_job_access').insert([row]).select('id').maybeSingle();
      if (ins.error && isOptionalColumnErr(ins.error.message ?? '')) {
        const { can_view_proposal, can_view_materials, can_edit_schedule, ...rest } = row;
        void can_view_proposal;
        void can_view_materials;
        void can_edit_schedule;
        ins = await admin.from('portal_job_access').insert([rest]).select('id').maybeSingle();
      }
      if (ins.error) {
        return new Response(JSON.stringify({ ok: false, error: ins.error.message }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, id: ins.data?.id ?? null }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update') {
      const id = String(body?.id ?? '');
      const patch = body?.payload as InsertRow | undefined;
      if (!id || !patch || typeof patch !== 'object') {
        return new Response(JSON.stringify({ ok: false, error: 'Missing id or payload' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let upd = await admin.from('portal_job_access').update(patch).eq('id', id).select('id').maybeSingle();
      if (upd.error && isOptionalColumnErr(upd.error.message ?? '')) {
        const { can_view_proposal, can_view_materials, can_edit_schedule, ...rest } = patch;
        void can_view_proposal;
        void can_view_materials;
        void can_edit_schedule;
        upd = await admin.from('portal_job_access').update(rest).eq('id', id).select('id').maybeSingle();
      }
      if (upd.error) {
        return new Response(JSON.stringify({ ok: false, error: upd.error.message }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, id: upd.data?.id ?? id }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list_for_subcontractor') {
      const portalUserId = String(body?.portal_user_id ?? '').trim();
      if (!portalUserId) {
        return new Response(JSON.stringify({ ok: false, error: 'Missing portal_user_id' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await admin
        .from('portal_job_access')
        .select('*, jobs(*)')
        .eq('portal_user_id', portalUserId);

      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ ok: true, rows: data ?? [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      const id = String(body?.id ?? '');
      if (!id) {
        return new Response(JSON.stringify({ ok: false, error: 'Missing id' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const del = await admin.from('portal_job_access').delete().eq('id', id).select('id').maybeSingle();
      if (del.error) {
        return new Response(JSON.stringify({ ok: false, error: del.error.message }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: 'Unknown action' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('portal-job-access:', e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
