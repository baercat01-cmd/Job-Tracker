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
    const { action, grantCode, clientId, clientSecret, jobName, jobId, materialItems, notes, orderType } = requestBody;

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

        // Sync materials to materials_catalog with proper UPDATE logic
        let itemsSynced = 0;
        let itemsUpdated = 0;
        let itemsInserted = 0;
        let itemsSkipped = 0;
        const skippedItems: string[] = [];
        
        for (const item of items) {
          // Log the full item to see what fields are available
          console.log('📋 Full Zoho item data:', JSON.stringify(item, null, 2));
          
          // Try multiple fields for SKU - Zoho Books can use different field names
          // Check all possible SKU field names
          const sku = 
            item.sku || 
            item.item_id || 
            item.product_id || 
            item.id || 
            item.item_code || 
            item.code || 
            item.part_number;
          
          console.log(`🔍 SKU extraction - Checking fields:`, {
            sku: item.sku,
            item_id: item.item_id,
            product_id: item.product_id,
            id: item.id,
            item_code: item.item_code,
            code: item.code,
            part_number: item.part_number,
            extracted_sku: sku
          });
          
          // CRITICAL: Skip items without a valid SKU
          if (!sku || sku.trim() === '') {
            console.warn(`⚠️ Skipping item without SKU - Name: ${item.name}`);
            console.warn(`   Available fields:`, Object.keys(item));
            itemsSkipped++;
            skippedItems.push(item.name || 'Unknown');
            continue;
          }
          
          console.log(`📦 Processing item - SKU: ${sku} - Name: ${item.name}`);
          
          const materialData = {
            sku: sku,
            material_name: item.name || 'Unknown Material',
            category: item.category || item.item_type || 'General',
            unit_price: parseFloat(item.rate || '0'),
            purchase_cost: parseFloat(item.purchase_rate || item.purchase_cost || '0'),
            part_length: item.unit || null,
            raw_metadata: item, // Store full Zoho data
            updated_at: new Date().toISOString(),
          };

          // Check if material exists
          const { data: existing, error: checkError } = await supabase
            .from('materials_catalog')
            .select('sku, unit_price, purchase_cost')
            .eq('sku', sku)
            .maybeSingle();

          if (checkError && checkError.code !== 'PGRST116') {
            console.error(`❌ Error checking material ${sku}:`, checkError);
            continue;
          }

          if (existing) {
            // Material exists - UPDATE only if prices changed
            const priceChanged = 
              existing.unit_price !== materialData.unit_price ||
              existing.purchase_cost !== materialData.purchase_cost;
            
            if (priceChanged) {
              const { error: updateError } = await supabase
                .from('materials_catalog')
                .update({
                  material_name: materialData.material_name,
                  category: materialData.category,
                  unit_price: materialData.unit_price,
                  purchase_cost: materialData.purchase_cost,
                  part_length: materialData.part_length,
                  raw_metadata: materialData.raw_metadata,
                  updated_at: materialData.updated_at,
                })
                .eq('sku', sku);

              if (!updateError) {
                itemsUpdated++;
                console.log(`✅ Updated material ${sku} with new prices`);
              } else {
                console.error(`❌ Failed to update material ${sku}:`, updateError);
              }
            } else {
              console.log(`⏭️ Material ${sku} unchanged - skipping`);
            }
            itemsSynced++;
          } else {
            // Material doesn't exist - INSERT new
            const { error: insertError } = await supabase
              .from('materials_catalog')
              .insert({
                ...materialData,
                created_at: new Date().toISOString(),
              });

            if (!insertError) {
              itemsInserted++;
              itemsSynced++;
              console.log(`✅ Inserted new material ${sku}`);
            } else {
              console.error(`❌ Failed to insert material ${sku}:`, insertError);
            }
          }
        }

        console.log(`📊 Sync Summary:`);
        console.log(`  ✅ ${itemsInserted} materials inserted`);
        console.log(`  🔄 ${itemsUpdated} materials updated`);
        console.log(`  ⏭️ ${itemsSynced - itemsInserted - itemsUpdated} materials unchanged`);
        console.log(`  ⚠️ ${itemsSkipped} materials skipped (no SKU)`);
        console.log(`  📋 Total processed: ${itemsSynced}`);
        
        if (skippedItems.length > 0) {
          console.log(`⚠️ Skipped items (no SKU): ${skippedItems.join(', ')}`);
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
            message: `Synced ${vendorsSynced} vendors and ${itemsSynced} materials from Zoho Books (${itemsInserted} new, ${itemsUpdated} updated, ${itemsSkipped} skipped)`,
            vendorsSynced,
            itemsSynced,
            itemsInserted,
            itemsUpdated,
            itemsSkipped,
            skippedItems,
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
      const { materialItemIds, userId } = requestBody;
      
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
          
          // Use "Martin Builder" as the customer (not the job name)
          const customerId = await findOrCreateCustomer(accessToken, settings.countywide_org_id, 'Martin Builder');
          console.log('✅ Customer ID:', customerId);
          
          // Ensure all items exist in Zoho as sellable items
          // SKU is the defining factor - ensure material has SKU attached from catalog
          const lineItems = [];
          for (const item of materialItems) {
            console.log('📦 Processing material for Sales Order - SKU:', item.sku, '- Name:', item.material_name, '- Length:', item.length);
            
            const itemId = await ensurePurchasableItem(
              accessToken,
              settings.countywide_org_id,
              item
            );
            
            lineItems.push({
              item_id: itemId,
              quantity: item.quantity,
              rate: item.price_per_unit || item.cost_per_unit || 0,
              unit: item.length || undefined, // Part length goes in unit field
              description: item.usage || item.category || item.material_name,
            });
          }
          
          const salesOrderData = {
            customer_id: customerId,
            reference_number: jobName, // Use job name as reference
            notes: notes || `Materials for ${jobName}`,
            line_items: lineItems,
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
          
          // Ensure all items exist in Zoho as purchasable items
          // SKU is the defining factor - ensure material has SKU attached from catalog
          const lineItems = [];
          for (const item of materialItems) {
            console.log('📦 Processing material for Purchase Order - SKU:', item.sku, '- Name:', item.material_name, '- Length:', item.length);
            
            const itemId = await ensurePurchasableItem(
              accessToken,
              settings.countywide_org_id,
              item
            );
            
            lineItems.push({
              item_id: itemId,
              quantity: item.quantity,
              rate: item.cost_per_unit || item.price_per_unit || 0,
              unit: item.length || undefined, // Part length goes in unit field
              description: item.usage || item.category || item.material_name,
            });
          }
          
          const purchaseOrderData = {
            vendor_id: vendorId,
            reference_number: `Job: ${jobName}`,
            notes: notes || `Materials for ${jobName}`,
            line_items: lineItems,
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

        // Update material_items with Zoho order information
        if (materialItemIds && materialItemIds.length > 0) {
          console.log('📝 Updating material items with Zoho order info...');
          
          const updateData: any = {
            updated_at: new Date().toISOString(),
            ordered_at: new Date().toISOString(),
            ordered_by: userId || null,
          };

          if (result.salesOrder) {
            updateData.zoho_sales_order_id = result.salesOrder.id;
            updateData.zoho_sales_order_number = result.salesOrder.number;
          }

          if (result.purchaseOrder) {
            updateData.zoho_purchase_order_id = result.purchaseOrder.id;
            updateData.zoho_purchase_order_number = result.purchaseOrder.number;
          }

          const { error: updateError } = await supabase
            .from('material_items')
            .update(updateData)
            .in('id', materialItemIds);

          if (updateError) {
            console.error('⚠️ Error updating material items:', updateError);
            // Don't throw - orders were created successfully
          } else {
            console.log('✅ Updated', materialItemIds.length, 'material items with order info');
          }
        }

        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error: any) {
        console.error('❌ Error creating orders:', error);
        throw error;
      }
    }

    if (action === 'create_quote') {
      const { materialItemIds, userId } = requestBody;
      
      if (!jobName || !materialItems || materialItems.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: jobName, materialItems' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('🔄 Creating Zoho quote for job:', jobName, '- Materials:', materialItems.length);

      try {
        // Get access token
        const accessToken = await getValidAccessToken(settings, supabase);

        // Find or create customer
        const customerId = await findOrCreateCustomer(accessToken, settings.countywide_org_id, jobName);
        console.log('✅ Customer ID:', customerId);
        
        const quoteData = {
          customer_id: customerId,
          reference_number: `Job: ${jobName}`,
          notes: notes || `Material tracking quote for ${jobName}`,
          line_items: materialItems.map((item: any) => ({
            item_id: item.sku || undefined,
            name: item.material_name,
            description: item.usage || item.category || '',
            quantity: item.quantity,
            rate: item.price_per_unit || item.cost_per_unit || 0,
          })),
        };

        const quoteResponse = await fetch(
          `https://www.zohoapis.com/books/v3/estimates?organization_id=${settings.countywide_org_id}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Zoho-oauthtoken ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(quoteData),
          }
        );

        if (!quoteResponse.ok) {
          const errorText = await quoteResponse.text();
          throw new Error(`Failed to create Quote: ${errorText}`);
        }

        const quoteResult = await quoteResponse.json();
        console.log('✅ Quote created:', quoteResult.estimate?.estimate_id);

        const result = {
          success: true,
          quote: {
            id: quoteResult.estimate?.estimate_id,
            number: quoteResult.estimate?.estimate_number,
            url: `https://books.zoho.com/app#/quotes/${quoteResult.estimate?.estimate_id}`,
          },
          message: `Created Quote #${quoteResult.estimate?.estimate_number} for ${jobName}`,
        };

        // Update job with quote information
        if (jobId) {
          console.log('📝 Updating job with quote info...');
          
          const { error: jobUpdateError } = await supabase
            .from('jobs')
            .update({
              zoho_quote_id: result.quote.id,
              zoho_quote_number: result.quote.number,
              zoho_quote_created_at: new Date().toISOString(),
            })
            .eq('id', jobId);

          if (jobUpdateError) {
            console.error('⚠️ Error updating job:', jobUpdateError);
            // Don't throw - quote was created successfully
          } else {
            console.log('✅ Updated job with quote info');
          }
        }

        // Update material_items with quote information
        if (materialItemIds && materialItemIds.length > 0) {
          console.log('📝 Updating material items with quote info...');
          
          const { error: updateError } = await supabase
            .from('material_items')
            .update({
              zoho_quote_id: result.quote.id,
              zoho_quote_number: result.quote.number,
              updated_at: new Date().toISOString(),
            })
            .in('id', materialItemIds);

          if (updateError) {
            console.error('⚠️ Error updating material items:', updateError);
            // Don't throw - quote was created successfully
          } else {
            console.log('✅ Updated', materialItemIds.length, 'material items with quote info');
          }
        }

        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error: any) {
        console.error('❌ Error creating quote:', error);
        throw error;
      }
    }

    // Handle webhook management actions
    if (action === 'register_webhooks') {
      const result = await registerWebhooks(supabase, requestBody);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'unregister_webhooks') {
      const result = await unregisterWebhooks(supabase, requestBody);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'list_webhooks') {
      const result = await listWebhooks(supabase);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

async function ensurePurchasableItem(
  accessToken: string,
  orgId: string,
  materialItem: any
): Promise<string> {
  const itemName = materialItem.material_name;
  const sku = materialItem.sku;
  
  // CRITICAL: SKU is mandatory - materials without SKU cannot be ordered
  if (!sku || sku.trim() === '') {
    throw new Error(`Material "${itemName}" has no SKU. Cannot create Zoho order without SKU.`);
  }
  
  console.log('🔍 Ensuring purchasable item exists - SKU:', sku, '- Name:', itemName);
  
  // CRITICAL: ONLY search by SKU (SKU is the defining factor)
  const skuSearchUrl = `https://www.zohoapis.com/books/v3/items?organization_id=${orgId}&sku=${encodeURIComponent(sku)}`;
  
  const skuSearchResponse = await fetch(skuSearchUrl, {
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
    },
  });

  if (skuSearchResponse.ok) {
    const skuSearchData = await skuSearchResponse.json();
    if (skuSearchData.items && skuSearchData.items.length > 0) {
      // Found item by SKU - this is the definitive match
      const skuMatch = skuSearchData.items[0];
      console.log('✅ Found existing item by SKU:', skuMatch.item_id, '- SKU:', skuMatch.sku);
      
      // Update item to ensure it's purchasable and sellable with latest info from catalog
      await updateItemPurchasable(accessToken, orgId, skuMatch.item_id, materialItem);
      
      return skuMatch.item_id;
    }
  }

  // Item with this SKU doesn't exist in Zoho - create new one
  console.log('📝 Creating new item in Zoho Books - SKU:', sku, '- Name:', itemName);
  
  const itemData = {
    name: itemName,
    sku: sku, // SKU is the defining factor for item identification
    description: materialItem.usage || materialItem.category || '',
    rate: materialItem.price_per_unit || materialItem.cost_per_unit || 0,
    purchase_rate: materialItem.cost_per_unit || materialItem.price_per_unit || 0,
    unit: materialItem.length || '', // Include length/unit from catalog
    // CRITICAL: Mark as both purchasable and sellable
    is_taxable: materialItem.taxable !== false,
    tax_id: '', // Empty for now, can be configured later
    item_type: 'sales_and_purchases', // This makes it both purchasable and sellable
  };
  
  const createResponse = await fetch(
    `https://www.zohoapis.com/books/v3/items?organization_id=${orgId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(itemData),
    }
  );

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    console.error('❌ Failed to create item:', errorText);
    throw new Error(`Failed to create item "${itemName}": ${errorText}`);
  }

  const createData = await createResponse.json();
  console.log('✅ Created new purchasable item:', createData.item?.item_id);
  return createData.item.item_id;
}

async function registerWebhooks(supabase: any, requestData: any) {
  console.log('📡 Registering Zoho Books webhooks...');
  
  const settings = await getSettings(supabase);
  const accessToken = await getValidAccessToken(settings, supabase);
  const orgType = requestData.orgType || 'countywide';
  const orgId = orgType === 'countywide' ? settings.countywide_org_id : settings.martin_builder_org_id;
  
  // Get the webhook URL (should be your deployed edge function URL)
  const webhookUrl = requestData.webhookUrl || `${supabaseUrl}/functions/v1/zoho-webhook`;
  
  console.log('📍 Webhook URL:', webhookUrl);
  
  const webhookEvents = [
    'salesorder.deleted',
    'salesorder.updated',
    'purchaseorder.deleted',
    'purchaseorder.updated',
    'invoice.created',
    'item.updated',
    'item.created',
  ];
  
  const registeredWebhooks = [];
  
  for (const eventType of webhookEvents) {
    try {
      const response = await fetch(
        `https://www.zohoapis.com/books/v3/webhooks?organization_id=${orgId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            webhook_url: webhookUrl,
            event_type: eventType,
            is_active: true,
          }),
        }
      );
      
      const result = await response.json();
      
      if (response.ok && result.code === 0) {
        console.log(`✅ Registered webhook for: ${eventType}`);
        registeredWebhooks.push({
          event_type: eventType,
          webhook_id: result.webhook.webhook_id,
        });
      } else {
        console.error(`❌ Failed to register ${eventType}:`, result.message);
      }
    } catch (error: any) {
      console.error(`❌ Error registering ${eventType}:`, error.message);
    }
  }
  
  return {
    success: true,
    message: `Registered ${registeredWebhooks.length} webhook(s)`,
    webhooks: registeredWebhooks,
  };
}

async function unregisterWebhooks(supabase: any, requestData: any) {
  console.log('🗑️ Unregistering Zoho Books webhooks...');
  
  const settings = await getSettings(supabase);
  const accessToken = await getValidAccessToken(settings, supabase);
  const orgType = requestData.orgType || 'countywide';
  const orgId = orgType === 'countywide' ? settings.countywide_org_id : settings.martin_builder_org_id;
  
  // First, get list of all webhooks
  const listResponse = await fetch(
    `https://www.zohoapis.com/books/v3/webhooks?organization_id=${orgId}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
      },
    }
  );
  
  const listResult = await listResponse.json();
  
  if (!listResponse.ok || listResult.code !== 0) {
    throw new Error(`Failed to list webhooks: ${listResult.message}`);
  }
  
  const webhooks = listResult.webhooks || [];
  const deletedWebhooks = [];
  
  for (const webhook of webhooks) {
    try {
      const deleteResponse = await fetch(
        `https://www.zohoapis.com/books/v3/webhooks/${webhook.webhook_id}?organization_id=${orgId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
          },
        }
      );
      
      const deleteResult = await deleteResponse.json();
      
      if (deleteResponse.ok && deleteResult.code === 0) {
        console.log(`✅ Deleted webhook: ${webhook.event_type}`);
        deletedWebhooks.push(webhook.webhook_id);
      } else {
        console.error(`❌ Failed to delete webhook ${webhook.webhook_id}:`, deleteResult.message);
      }
    } catch (error: any) {
      console.error(`❌ Error deleting webhook ${webhook.webhook_id}:`, error.message);
    }
  }
  
  return {
    success: true,
    message: `Deleted ${deletedWebhooks.length} webhook(s)`,
    deleted: deletedWebhooks,
  };
}

async function listWebhooks(supabase: any) {
  console.log('📋 Listing Zoho Books webhooks...');
  
  const settings = await getSettings(supabase);
  const accessToken = await getValidAccessToken(settings, supabase);
  
  const webhooks: any = {
    countywide: [],
    martin_builder: [],
  };
  
  // Get Countywide webhooks
  if (settings.countywide_org_id) {
    try {
      const response = await fetch(
        `https://www.zohoapis.com/books/v3/webhooks?organization_id=${settings.countywide_org_id}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
          },
        }
      );
      
      const result = await response.json();
      
      if (response.ok && result.code === 0) {
        webhooks.countywide = result.webhooks || [];
      }
    } catch (error: any) {
      console.error('❌ Error listing Countywide webhooks:', error.message);
    }
  }
  
  // Get Martin Builder webhooks
  if (settings.martin_builder_org_id) {
    try {
      const response = await fetch(
        `https://www.zohoapis.com/books/v3/webhooks?organization_id=${settings.martin_builder_org_id}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
          },
        }
      );
      
      const result = await response.json();
      
      if (response.ok && result.code === 0) {
        webhooks.martin_builder = result.webhooks || [];
      }
    } catch (error: any) {
      console.error('❌ Error listing Martin Builder webhooks:', error.message);
    }
  }
  
  return {
    success: true,
    webhooks,
  };
}

async function getSettings(supabase: any): Promise<ZohoSettings> {
  const { data: settings, error } = await supabase
    .from('zoho_integration_settings')
    .select('*')
    .limit(1)
    .maybeSingle();
  
  if (error) throw error;
  if (!settings) throw new Error('Zoho integration not configured');
  
  return settings;
}

async function updateItemPurchasable(
  accessToken: string,
  orgId: string,
  itemId: string,
  materialItem: any
): Promise<void> {
  console.log('🔄 Updating item to be purchasable:', itemId, '- SKU:', materialItem.sku);
  
  // Update with ALL information from the SKU in materials_catalog
  const updateData = {
    name: materialItem.material_name,
    sku: materialItem.sku, // Ensure SKU is set
    rate: materialItem.price_per_unit || materialItem.cost_per_unit || 0,
    purchase_rate: materialItem.cost_per_unit || materialItem.price_per_unit || 0,
    unit: materialItem.length || '', // Include length/unit from catalog
    description: materialItem.usage || materialItem.category || '',
    item_type: 'sales_and_purchases', // Ensure it's both purchasable and sellable
  };
  
  const updateResponse = await fetch(
    `https://www.zohoapis.com/books/v3/items/${itemId}?organization_id=${orgId}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    }
  );

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    console.warn('⚠️ Failed to update item purchasable flag:', errorText);
    // Don't throw - item exists, just might not be updated
  } else {
    console.log('✅ Item updated to be purchasable');
  }
}
