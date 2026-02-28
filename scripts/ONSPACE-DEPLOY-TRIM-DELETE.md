# OnSpace prompt: Deploy trim delete Edge Function

Copy the prompt below and paste it into OnSpace (or wherever you configure Edge Functions) so the Trim Calculator can delete saved configs. The function uses the service role and bypasses table permissions.

---

## Prompt for OnSpace

**Add or deploy this Supabase Edge Function so the Trim Calculator can delete saved trim configs.**

**Function name:** `delete-trim-config`  
**Trigger:** HTTP POST (invoked by the frontend via `supabase.functions.invoke('delete-trim-config', { body: { config_id: "<uuid>" } })`).

**Behavior:** Accept a JSON body `{ "config_id": "<uuid>" }`, delete the row from `public.trim_saved_configs` where `id = config_id` using the **service role** client (so it works even when RLS or table grants block the anon/authenticated role). Return `{ "deleted_id": "<uuid>" }` on success, or `{ "error": "Not found or already deleted", "deleted_id": null }` if no row was deleted.

**Code for the function** (Deno; use `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment):

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { config_id } = await req.json();
    if (!config_id || typeof config_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid config_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase
      .from('trim_saved_configs')
      .delete()
      .eq('id', config_id.trim())
      .select('id');

    if (error) {
      console.error('Delete error:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!data || data.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Not found or already deleted', deleted_id: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ deleted_id: data[0].id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('delete-trim-config error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

**After this function is deployed**, the Trim Calculator’s delete button will work without any database permission or RLS changes.
