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
    // Read the request body ONCE and use it throughout
    const requestBody = await req.json();
    const { action, grantCode, clientId, clientSecret, jobName, materialItems, notes, orderType } = requestBody;

    console.log('📡 Zoho sync request:', action);

    // Handle grant code exchange (no settings needed yet)
    if (action === 'exchange_grant_code') {
      if (!grantCode || !clientId || !clientSecret) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: grantCode, clientId, clientSecret' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('🔄 Exchanging grant code for refresh token...');

      try {
        const tokenUrl = 'https://accounts.zoho.com/oauth/v2/token';
        const params = new URLSearchParams({
          code: grantCode,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          redirect_uri: 'https://www.zoho.com/books',
        });

        const response = await fetch(`${tokenUrl}?${params.toString()}`, {
          method: 'POST',
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Zoho token exchange failed: ${errorText}`);
        }

        const tokenData = await response.json();

        if (!tokenData.refresh_token) {
          throw new Error('No refresh token received from Zoho');
        }

        console.log('✅ Grant code exchanged successfully');

        return new Response(
          JSON.stringify({
            success: true,
            refresh_token: tokenData.refresh_token,
            message: 'Grant code exchanged successfully',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (exchangeError: any) {
        console.error('❌ Grant code exchange error:', exchangeError);
        throw new Error(`Grant code exchange failed: ${exchangeError.message}`);
      }
    }

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

    // Validate organization ID
    if (!settings.countywide_org_id || settings.countywide_org_id.trim() === '') {
      return new Response(
        JSON.stringify({ 
          error: 'Organization ID is missing. Please enter your Zoho Books Organization ID in Settings.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔍 Using Organization ID:', settings.countywide_org_id);

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
        console.log('📡 Fetching vendors from Zoho Books...');
        // Fetch vendors from Zoho
        const vendors = await fetchZohoVendors(accessToken, settings.countywide_org_id);
        console.log(`✅ Fetched ${vendors.length} vendors from Zoho`);

        console.log('📡 Fetching items from Zoho Books...');
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

    if (action === 'create_orders') {
      // Body already read above - use extracted values
      if (!jobName || !materialItems || materialItems.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: jobName, materialItems' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('🔄 Creating orders for job:', jobName, 'Type:', orderType || 'both');

      try {
        // Get access token
        const accessToken = await getValidAccessToken(settings, supabase);

        const result: any = { success: true };

        // Create Sales Order (if requested)
        if (!orderType || orderType === 'both' || orderType === 'sales_order') {
          console.log('📋 Creating Sales Order...');
          
          // First, find or create customer
          const customerId = await findOrCreateCustomer(accessToken, settings.countywide_org_id, jobName);
          console.log('✅ Customer ID:', customerId);
          
          const salesOrderData = {
            customer_id: customerId,
            reference_number: `Job: ${jobName}`,
            notes: notes || `Materials for ${jobName}`,
            line_items: materialItems.map((item: any) => ({
              item_id: item.sku || undefined,
              name: item.material_name,
              description: item.usage || item.category || '',
              quantity: item.quantity,
              rate: item.price_per_unit || item.cost_per_unit || 0,
            })),
          };

          const salesOrderResponse = await fetch(
            `https://www.zohoapis.com/books/v3/salesorders?organization_id=${settings.countywide_org_id}`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(salesOrderData),
            }
          );

          if (!salesOrderResponse.ok) {
            const errorText = await salesOrderResponse.text();
            throw new Error(`Failed to create Sales Order: ${errorText}`);
          }

          const salesOrderResult = await salesOrderResponse.json();
          console.log('✅ Sales Order created:', salesOrderResult.salesorder?.salesorder_id);

          result.salesOrder = {
            id: salesOrderResult.salesorder?.salesorder_id,
            number: salesOrderResult.salesorder?.salesorder_number,
            url: `https://books.zoho.com/app#/salesorders/${salesOrderResult.salesorder?.salesorder_id}`,
          };
        }

        // Create Purchase Order (if requested)
        if (!orderType || orderType === 'both' || orderType === 'purchase_order') {
          console.log('📋 Creating Purchase Order...');
          
          // First, find or create vendor
          const vendorId = await findOrCreateVendor(accessToken, settings.countywide_org_id, 'Material Supplier');
          console.log('✅ Vendor ID:', vendorId);
          
          const purchaseOrderData = {
            vendor_id: vendorId,
            reference_number: `Job: ${jobName}`,
            notes: notes || `Materials for ${jobName}`,
            line_items: materialItems.map((item: any) => ({
              item_id: item.sku || undefined,
              name: item.material_name,
              description: item.usage || item.category || '',
              quantity: item.quantity,
              rate: item.cost_per_unit || item.price_per_unit || 0,
            })),
          };

          const purchaseOrderResponse = await fetch(
            `https://www.zohoapis.com/books/v3/purchaseorders?organization_id=${settings.countywide_org_id}`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(purchaseOrderData),
            }
          );

          if (!purchaseOrderResponse.ok) {
            const errorText = await purchaseOrderResponse.text();
            throw new Error(`Failed to create Purchase Order: ${errorText}`);
          }

          const purchaseOrderResult = await purchaseOrderResponse.json();
          console.log('✅ Purchase Order created:', purchaseOrderResult.purchaseorder?.purchaseorder_id);

          result.purchaseOrder = {
            id: purchaseOrderResult.purchaseorder?.purchaseorder_id,
            number: purchaseOrderResult.purchaseorder?.purchaseorder_number,
            url: `https://books.zoho.com/app#/purchaseorders/${purchaseOrderResult.purchaseorder?.purchaseorder_id}`,
          };
        }

        // Build message based on what was created
        let message = 'Created ';
        if (result.salesOrder && result.purchaseOrder) {
          message += `Sales Order #${result.salesOrder.number} and Purchase Order #${result.purchaseOrder.number}`;
        } else if (result.salesOrder) {
          message += `Sales Order #${result.salesOrder.number}`;
        } else if (result.purchaseOrder) {
          message += `Purchase Order #${result.purchaseOrder.number}`;
        }
        message += ` for ${jobName}`;

        result.message = message;

        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error: any) {
        console.error('❌ Error creating orders:', error);
        throw error;
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
  
  console.log('🌐 Calling Zoho API:', url);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Zoho API Error Response:', errorText);
    
    // Parse error to provide helpful message
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.code === 2 || errorJson.message?.includes('organization_id')) {
        throw new Error('Invalid Organization ID. Please check your Zoho Books Organization ID in Settings.');
      }
    } catch (e) {
      // If parsing fails, use original error
    }
    
    throw new Error(`Failed to fetch Zoho vendors: ${errorText}`);
  }

  const data = await response.json();
  return data.contacts || [];
}

async function fetchZohoItems(accessToken: string, orgId: string): Promise<any[]> {
  const url = `https://www.zohoapis.com/books/v3/items?organization_id=${orgId}`;
  
  console.log('🌐 Calling Zoho API:', url);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Zoho API Error Response:', errorText);
    
    // Parse error to provide helpful message
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.code === 2 || errorJson.message?.includes('organization_id')) {
        throw new Error('Invalid Organization ID. Please check your Zoho Books Organization ID in Settings.');
      }
    } catch (e) {
      // If parsing fails, use original error
    }
    
    throw new Error(`Failed to fetch Zoho items: ${errorText}`);
  }

  const data = await response.json();
  return data.items || [];
}

async function findOrCreateCustomer(accessToken: string, orgId: string, customerName: string): Promise<string> {
  console.log('🔍 Finding or creating customer:', customerName);
  
  // Search for existing customer
  const searchUrl = `https://www.zohoapis.com/books/v3/contacts?organization_id=${orgId}&contact_name=${encodeURIComponent(customerName)}`;
  
  const searchResponse = await fetch(searchUrl, {
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
    },
  });

  if (searchResponse.ok) {
    const searchData = await searchResponse.json();
    if (searchData.contacts && searchData.contacts.length > 0) {
      console.log('✅ Found existing customer:', searchData.contacts[0].contact_id);
      return searchData.contacts[0].contact_id;
    }
  }

  // Customer doesn't exist, create new one
  console.log('📝 Creating new customer:', customerName);
  
  const createResponse = await fetch(
    `https://www.zohoapis.com/books/v3/contacts?organization_id=${orgId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contact_name: customerName,
        contact_type: 'customer',
        company_name: customerName,
      }),
    }
  );

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`Failed to create customer: ${errorText}`);
  }

  const createData = await createResponse.json();
  console.log('✅ Created new customer:', createData.contact?.contact_id);
  return createData.contact.contact_id;
}

async function findOrCreateVendor(accessToken: string, orgId: string, vendorName: string): Promise<string> {
  console.log('🔍 Finding or creating vendor:', vendorName);
  
  // Search for existing vendor
  const searchUrl = `https://www.zohoapis.com/books/v3/contacts?organization_id=${orgId}&contact_name=${encodeURIComponent(vendorName)}&contact_type=vendor`;
  
  const searchResponse = await fetch(searchUrl, {
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
    },
  });

  if (searchResponse.ok) {
    const searchData = await searchResponse.json();
    if (searchData.contacts && searchData.contacts.length > 0) {
      console.log('✅ Found existing vendor:', searchData.contacts[0].contact_id);
      return searchData.contacts[0].contact_id;
    }
  }

  // Vendor doesn't exist, create new one
  console.log('📝 Creating new vendor:', vendorName);
  
  const createResponse = await fetch(
    `https://www.zohoapis.com/books/v3/contacts?organization_id=${orgId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contact_name: vendorName,
        contact_type: 'vendor',
        company_name: vendorName,
      }),
    }
  );

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`Failed to create vendor: ${errorText}`);
  }

  const createData = await createResponse.json();
  console.log('✅ Created new vendor:', createData.contact?.contact_id);
  return createData.contact.contact_id;
}
