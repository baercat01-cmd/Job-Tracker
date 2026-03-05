import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const authClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const quoteId: string = body?.quote_id ?? body?.p_quote_id ?? '';
    const userId: string = body?.user_id ?? body?.p_user_id ?? user.id;

    if (!quoteId) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing quote_id' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service-role client — bypasses Row Level Security
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // 1) Try the RPC (SECURITY DEFINER; atomic)
    const { error: rpcError } = await admin.rpc('mark_proposal_as_sent', {
      p_quote_id: quoteId,
      p_user_id: userId,
    });
    if (!rpcError) {
      return new Response(JSON.stringify({ ok: true, quote_id: quoteId }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.warn('RPC failed, trying direct updates. RPC error:', rpcError.message);

    // 2) Direct updates via service-role (bypasses RLS; needs sent_at/sent_by columns)
    const { error: lockErr } = await admin
      .from('material_workbooks')
      .update({ status: 'locked', updated_at: new Date().toISOString() })
      .eq('quote_id', quoteId);

    if (lockErr) {
      console.error('Lock workbooks failed:', lockErr.message);
    }

    const { error: sentErr } = await admin
      .from('quotes')
      .update({ sent_at: new Date().toISOString(), sent_by: userId })
      .eq('id', quoteId);

    if (sentErr) {
      const isColumnMissing = /column|does not exist|schema/i.test(sentErr.message);
      const hint = isColumnMissing
        ? 'Run scripts/setup-mark-as-sent.sql in Supabase SQL Editor to add the required columns and function.'
        : undefined;
      return new Response(
        JSON.stringify({ ok: false, error: sentErr.message, rpc_error: rpcError.message, hint }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ ok: true, quote_id: quoteId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('mark-proposal-as-sent error:', e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
