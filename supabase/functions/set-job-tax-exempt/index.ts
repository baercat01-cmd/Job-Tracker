import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import postgres from 'npm:postgres';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const databaseUrl = Deno.env.get('DATABASE_URL') ?? '';

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
    const jobId: string = body?.job_id ?? body?.p_job_id ?? '';
    const quoteId: string = body?.quote_id ?? body?.p_quote_id ?? '';
    const value: boolean = body?.value ?? body?.p_value === true;

    if (!jobId || !quoteId) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing job_id or quote_id' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // 1) Try RPC first (works when PostgREST schema cache has the function)
    const { error: rpcError } = await admin.rpc('set_quote_tax_exempt', {
      p_job_id: jobId,
      p_quote_id: quoteId,
      p_value: value,
    });
    if (!rpcError) {
      return new Response(JSON.stringify({ ok: true, job_id: jobId, quote_id: quoteId }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) Try direct update (works when schema cache has tax_exempt column)
    if (value) {
      const { error: updateAllErr } = await admin
        .from('quotes')
        .update({ tax_exempt: true })
        .eq('job_id', jobId);
      if (!updateAllErr) {
        return new Response(JSON.stringify({ ok: true, job_id: jobId, quote_id: quoteId }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      const { error: updateOneErr } = await admin
        .from('quotes')
        .update({ tax_exempt: false })
        .eq('id', quoteId);
      if (!updateOneErr) {
        return new Response(JSON.stringify({ ok: true, job_id: jobId, quote_id: quoteId }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 3) Raw SQL via postgres driver — bypasses PostgREST schema cache (requires DATABASE_URL secret)
    if (databaseUrl) {
      try {
        const sql = postgres(databaseUrl, { max: 1 });
        if (value) {
          await sql`UPDATE public.quotes SET tax_exempt = true WHERE job_id = ${jobId}`;
        } else {
          await sql`UPDATE public.quotes SET tax_exempt = false WHERE id = ${quoteId}`;
        }
        await sql.end();
        return new Response(JSON.stringify({ ok: true, job_id: jobId, quote_id: quoteId }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (rawErr) {
        console.error('Raw SQL tax_exempt update failed:', rawErr);
        const msg = rawErr instanceof Error ? rawErr.message : String(rawErr);
        if (/column "job_id" does not exist/i.test(msg)) {
          return new Response(JSON.stringify({
            ok: false,
            error: 'quotes table has no job_id column. Use the job-link column name in your schema (e.g. job).',
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    return new Response(JSON.stringify({
      ok: false,
      error: 'Tax exempt could not be saved. RPC and direct update failed (schema cache may be stale). Add DATABASE_URL secret to this Edge Function and redeploy, or reload the API schema in Supabase Dashboard → Settings → API.',
      rpc_error: rpcError?.message,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('set-job-tax-exempt error:', e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
