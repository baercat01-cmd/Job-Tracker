import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface ZohoSettings {
  id: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  countywide_org_id: string;
  access_token: string | null;
  token_expires_at: string | null;
}

interface ZohoTokenResponse {
  access_token: string;
  expires_in: number;
  api_domain: string;
  token_type: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { action } = await req.json();

    console.log('📡 Zoho sync request:', action);

    // Get Zoho settings
    const { data: settings, error: settingsError } = await supabase
      .from('zoho_integration_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (settingsError) throw settingsError;
    if (!settings) {
      return new Response(
        JSON.stringify({ error: 'Zoho integration not configured. Please add credentials in Settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get or refresh access token
    const accessToken = await getValidAccessToken(settings, supabase);

    if (action === 'sync_materials') {
      console.log('🔄 Starting materials sync from Zoho Books...');
      
      // Update sync status
      await supabase
        .from('zoho_integration_settings')
        .update({ sync_status: 'syncing', sync_error: null })
        .eq('id', settings.id);

      try {
        // Fetch vendors from Zoho
        const vendors = await fetchZohoVendors(accessToken, settings.countywide_org_id);
        console.log(`✅ Fetched ${vendors.length} vendors from Zoho`);

        // Fetch items (materials) from Zoho
        const items = await fetchZohoItems(accessToken, settings.countywide_org_id);
        console.log(`✅ Fetched ${items.length} items from Zoho`);

        // Sync vendors to database
        let vendorsSynced = 0;
        for (const vendor of vendors) {
          const { error } = await supabase
            .from('vendors')
            .upsert({
              name: vendor.vendor_name,
              contact_person: vendor.contact_persons?.[0]?.first_name || null,
              phone: vendor.contact_persons?.[0]?.phone || null,
              email: vendor.contact_persons?.[0]?.email || null,
              // Store Zoho ID for future updates
            }, { onConflict: 'name' });

          if (!error) vendorsSynced++;
        }

        // Sync materials to materials_catalog
        let itemsSynced = 0;
        for (const item of items) {
          const { error } = await supabase
            .from('materials_catalog')
            .upsert({
              sku: item.item_id || item.sku,
              material_name: item.name,
              category: item.item_type || 'General',
              unit_price: parseFloat(item.rate || '0'),
              purchase_cost: parseFloat(item.purchase_rate || '0'),
              raw_metadata: item, // Store full Zoho data
            }, { onConflict: 'sku' });

          if (!error) itemsSynced++;
        }

        // Update sync status
        await supabase
          .from('zoho_integration_settings')
          .update({
            sync_status: 'completed',
            last_sync_at: new Date().toISOString(),
          })
          .eq('id', settings.id);

        return new Response(
          JSON.stringify({
            success: true,
            message: `Synced ${vendorsSynced} vendors and ${itemsSynced} materials from Zoho Books`,
            vendorsSynced,
            itemsSynced,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (syncError: any) {
        console.error('❌ Sync error:', syncError);
        
        // Update error status
        await supabase
          .from('zoho_integration_settings')
          .update({
            sync_status: 'error',
            sync_error: syncError.message,
          })
          .eq('id', settings.id);

        throw syncError;
      }
    }

    return new Response(
      JSON.stringify({ error: 'Unknown action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Zoho sync error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Zoho sync failed', 
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getValidAccessToken(
  settings: ZohoSettings,
  supabase: any
): Promise<string> {
  // Check if current token is still valid (with 5 min buffer)
  if (settings.access_token && settings.token_expires_at) {
    const expiresAt = new Date(settings.token_expires_at);
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutes

    if (expiresAt.getTime() - now.getTime() > bufferTime) {
      console.log('✅ Using existing access token');
      return settings.access_token;
    }
  }

  console.log('🔄 Refreshing Zoho access token...');

  // Refresh the token
  const tokenUrl = 'https://accounts.zoho.com/oauth/v2/token';
  const params = new URLSearchParams({
    refresh_token: settings.refresh_token,
    client_id: settings.client_id,
    client_secret: settings.client_secret,
    grant_type: 'refresh_token',
  });

  const response = await fetch(`${tokenUrl}?${params.toString()}`, {
    method: 'POST',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoho token refresh failed: ${errorText}`);
  }

  const tokenData: ZohoTokenResponse = await response.json();

  // Calculate expiry time
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

  // Save new token to database
  await supabase
    .from('zoho_integration_settings')
    .update({
      access_token: tokenData.access_token,
      token_expires_at: expiresAt.toISOString(),
    })
    .eq('id', settings.id);

  console.log('✅ Access token refreshed');
  return tokenData.access_token;
}

async function fetchZohoVendors(accessToken: string, orgId: string): Promise<any[]> {
  const url = `https://www.zohoapis.com/books/v3/contacts?contact_type=vendor&organization_id=${orgId}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Zoho vendors: ${errorText}`);
  }

  const data = await response.json();
  return data.contacts || [];
}

async function fetchZohoItems(accessToken: string, orgId: string): Promise<any[]> {
  const url = `https://www.zohoapis.com/books/v3/items?organization_id=${orgId}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Zoho items: ${errorText}`);
  }

  const data = await response.json();
  return data.items || [];
}
