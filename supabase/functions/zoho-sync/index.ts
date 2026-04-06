import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';
import {
  getMaterialLineSellAndCost,
  zohoRateFromLineTotal,
  type MetalCatalogBySku,
} from '../_shared/materialItemLineMoney.ts';

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
    // Read the request body ONCE and use it throughout (allow empty body for GET-style calls)
    let requestBody: Record<string, unknown> = {};
    try {
      const raw = await req.json();
      if (raw && typeof raw === 'object') requestBody = raw as Record<string, unknown>;
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid or missing request body', details: 'Request body must be valid JSON.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const { action, grantCode, clientId, clientSecret, jobName, jobId, materialItems, notes, orderType, syncPage: syncPageParam } = requestBody;

    console.log('📡 Zoho sync request:', action);

    // Warm-up: return immediately so next request (sync_materials page 1) hits a warm instance and avoids cold-start timeout
    if (action === 'warm') {
      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
      // Always use chunked mode to avoid timeout; default to page 1 if syncPage missing
      const pageNum = syncPageParam != null ? Number(syncPageParam) : 1;
      const syncPage = Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1;
      const isChunked = true;

      console.log('🔄 Chunked materials sync, page', syncPage);

      try {
        // --- CHUNKED MODE: minimal work per request to stay under function timeout ---
        if (isChunked) {
          const accountIdToName = new Map<string, string>();
          const ITEMS_PER_PAGE = 10;
          const { items, hasMore } = await fetchZohoItemsPage(accessToken, settings.countywide_org_id, syncPage, ITEMS_PER_PAGE);
          const now = new Date().toISOString();
          const rows: any[] = [];
          let itemsSkipped = 0;
          const skippedItems: string[] = [];
          let inactiveRemoved = 0;
          const inactiveSkus: string[] = [];

          for (const item of items) {
            const sku =
              item.sku || item.item_id || item.product_id || item.id || item.item_code || item.code || item.part_number;
            if (!sku || sku.trim() === '') {
              itemsSkipped++;
              skippedItems.push(item.name || 'Unknown');
              continue;
            }
            if (isImportedSkuValue(sku)) {
              inactiveSkus.push(String(sku));
              continue;
            }
            if (!isZohoItemActive(item)) {
              inactiveSkus.push(String(sku));
              continue;
            }
            const unitPrice = parseFloat(item.rate || item.selling_price || item.sales_rate || item.price || '0');
            const purchaseCost = parseFloat(item.purchase_rate || item.purchase_cost || item.cost_price || item.cost || '0');
            let partLength = getPartLengthFromZohoItem(item);
            if (!partLength && (item.item_id || item.id)) {
              try {
                const fullItem = await fetchZohoItemDetails(accessToken, settings.countywide_org_id, String(item.item_id || item.id));
                if (fullItem) partLength = getPartLengthFromZohoItem(fullItem);
              } catch (e) {
                console.warn(`Part length fetch for ${sku}:`, (e as Error).message);
              }
            }
            rows.push({
              sku,
              material_name: item.name || 'Unknown Material',
              category: getCategoryFromZohoItem(item, accountIdToName),
              unit_price: unitPrice,
              purchase_cost: purchaseCost,
              part_length: partLength,
              raw_metadata: item,
              updated_at: now,
              created_at: now,
            });
          }

          let itemsSynced = 0;
          if (rows.length > 0) {
            const { error: uErr } = await supabase
              .from('materials_catalog')
              .upsert(rows, { onConflict: 'sku' });
            if (!uErr) itemsSynced = rows.length;
          }
          if (inactiveSkus.length > 0) {
            const { error: dErr, count } = await supabase
              .from('materials_catalog')
              .delete({ count: 'exact' })
              .in('sku', inactiveSkus);
            if (dErr) {
              console.warn('⚠️ Failed removing inactive SKUs from materials_catalog:', dErr.message);
            } else {
              inactiveRemoved = count ?? 0;
            }
          }

          if (!hasMore) {
            await supabase
              .from('zoho_integration_settings')
              .update({ sync_status: 'completed', last_sync_at: new Date().toISOString() })
              .eq('id', settings.id);
          }

          return new Response(
            JSON.stringify({
              success: true,
              hasMore,
              nextPage: hasMore ? syncPage + 1 : undefined,
              message: hasMore
                ? `Synced page ${syncPage} (${itemsSynced} materials). More pages to go...`
                : `Synced ${itemsSynced} materials from Zoho Books (${itemsSkipped} skipped, ${inactiveRemoved} inactive removed)`,
              vendorsSynced: 0,
              itemsSynced,
              itemsInserted: itemsSynced,
              itemsUpdated: 0,
              itemsSkipped,
              skippedItems,
              inactiveRemoved,
              insertedItems: [],
              updatedItems: [],
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // --- FULL SYNC (legacy; may timeout on very large catalogs) ---
        console.log('📡 Fetching vendors from Zoho Books...');
        const vendors = await fetchZohoVendors(accessToken, settings.countywide_org_id);
        console.log(`✅ Fetched ${vendors.length} vendors from Zoho`);

        console.log('📡 Fetching items from Zoho Books...');
        const items = await fetchZohoItems(accessToken, settings.countywide_org_id);
        console.log(`✅ Fetched ${items.length} items from Zoho`);

        const accountIdToName = await fetchChartOfAccounts(accessToken, settings.countywide_org_id);
        console.log(`✅ Loaded ${accountIdToName.size} accounts for category lookup`);

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
        const insertedItems: { sku: string; name: string }[] = [];
        const updatedItems: { sku: string; name: string }[] = [];
        const MAX_CHANGE_LIST = 500;
        const needPartLength: { sku: string; item_id: string }[] = [];

        for (const item of items) {
          // Extract SKU first
          const sku = 
            item.sku || 
            item.item_id || 
            item.product_id || 
            item.id || 
            item.item_code || 
            item.code || 
            item.part_number;
          
          // CRITICAL: Skip items without a valid SKU
          if (!sku || sku.trim() === '') {
            console.warn(`⚠️ Skipping item without SKU - Name: ${item.name}`);
            itemsSkipped++;
            skippedItems.push(item.name || 'Unknown');
            continue;
          }
          
          // DEBUG: Log ALL available price-related fields from Zoho
          if (itemsSynced === 0) {
            console.log('🔍 FIRST ITEM - All Zoho fields:', JSON.stringify(item, null, 2));
          }
          
          // Try multiple field name variations for prices
          const unitPrice = parseFloat(
            item.rate || 
            item.selling_price || 
            item.sales_rate || 
            item.price || 
            '0'
          );
          
          const purchaseCost = parseFloat(
            item.purchase_rate || 
            item.purchase_cost || 
            item.cost_price || 
            item.cost || 
            '0'
          );
          
          console.log(`📦 Processing: SKU=${sku}, Name=${item.name}`);
          console.log(`   💰 Parsed Prices - Unit Price: $${unitPrice}, Purchase Cost: $${purchaseCost}`);
          console.log(`   📊 Raw price fields available:`);
          console.log(`      - rate: "${item.rate}"`);
          console.log(`      - selling_price: "${item.selling_price}"`);
          console.log(`      - purchase_rate: "${item.purchase_rate}"`);
          console.log(`      - purchase_cost: "${item.purchase_cost}"`);
          console.log(`      - cost_price: "${item.cost_price}"`);
          console.log(`      - cost: "${item.cost}"`);
          
          if (unitPrice === 0 && purchaseCost === 0) {
            console.warn(`⚠️ WARNING: Both prices are $0.00 for ${sku} - check Zoho field names!`);
          }

          // Part length must come from the material (e.g. custom field "Part Length"), NOT from usage unit (pcs, Bag, etc.)
          let partLength = getPartLengthFromZohoItem(item);
          if (!partLength && (item.item_id || item.id)) {
            needPartLength.push({ sku: String(sku), item_id: String(item.item_id || item.id) });
          }

          const materialData = {
            sku: sku,
            material_name: item.name || 'Unknown Material',
            category: getCategoryFromZohoItem(item, accountIdToName),
            unit_price: unitPrice,
            purchase_cost: purchaseCost,
            part_length: partLength,
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
            // Material exists - UPDATE ALL FIELDS from Zoho Books (Zoho is source of truth)
            console.log(`   🔄 Updating existing material - Old Price: $${existing.unit_price}, New Price: $${materialData.unit_price}`);
            console.log(`   🔄 Old Cost: $${existing.purchase_cost}, New Cost: $${materialData.purchase_cost}`);
            
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
              if (updatedItems.length < MAX_CHANGE_LIST) updatedItems.push({ sku, name: materialData.material_name });
              const priceChanged = existing.unit_price !== materialData.unit_price || existing.purchase_cost !== materialData.purchase_cost;
              console.log(`✅ Updated ${sku} ${priceChanged ? '(PRICES CHANGED)' : '(no price change)'} - Name: ${materialData.material_name}, Price: $${materialData.unit_price}, Cost: $${materialData.purchase_cost}`);
            } else {
              console.error(`❌ Failed to update material ${sku}:`, updateError);
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
              if (insertedItems.length < MAX_CHANGE_LIST) insertedItems.push({ sku, name: materialData.material_name });
              console.log(`✅ Inserted new material ${sku}`);
            } else {
              console.error(`❌ Failed to insert material ${sku}:`, insertError);
            }
          }
        }

        // For items missing Part Length from list response, fetch full item details (includes custom_fields)
        const MAX_FETCH_PART_LENGTH = 250;
        let partLengthFetched = 0;
        for (const { sku: fetchSku, item_id: itemId } of needPartLength.slice(0, MAX_FETCH_PART_LENGTH)) {
          try {
            const fullItem = await fetchZohoItemDetails(accessToken, settings.countywide_org_id, itemId);
            if (!fullItem) continue;
            const pl = getPartLengthFromZohoItem(fullItem);
            const categoryFromFull = getCategoryFromZohoItem(fullItem, accountIdToName);
            const updates: { part_length?: string; category?: string; updated_at: string } = { updated_at: new Date().toISOString() };
            if (pl) updates.part_length = pl;
            if (categoryFromFull && categoryFromFull !== 'General') updates.category = categoryFromFull;
            if (!updates.part_length && !updates.category) continue;
            const { error: upErr } = await supabase
              .from('materials_catalog')
              .update(updates)
              .eq('sku', fetchSku);
            if (!upErr) partLengthFetched++;
          } catch (e) {
            console.warn(`Part length fetch for ${fetchSku}:`, (e as Error).message);
          }
        }
        if (partLengthFetched > 0) {
          console.log(`📐 Fetched Part Length for ${partLengthFetched} materials via Get Item API`);
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
            insertedItems,
            updatedItems,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (syncError: any) {
        console.error('❌ Sync error:', syncError);
        const details = syncError?.message || String(syncError);

        // Update error status so UI can show it
        await supabase
          .from('zoho_integration_settings')
          .update({
            sync_status: 'error',
            sync_error: details,
          })
          .eq('id', settings.id);

        // Return a proper JSON response so the client always gets a parseable body (no rethrow)
        const isAuthError = /token|refresh|unauthorized|invalid_grant|expired|credentials/i.test(details);
        const userMessage = isAuthError
          ? 'Zoho authentication failed. Check your Zoho Books credentials and re-authorize in Settings.'
          : 'Zoho sync failed';
        return new Response(
          JSON.stringify({ error: userMessage, details }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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

        const itemsForOrders = Array.isArray(materialItems) ? materialItems : [];
        const skusForCatalog = new Set<string>();
        for (const raw of itemsForOrders) {
          const row = raw as Record<string, unknown>;
          const cat = row.category;
          const sku = row.sku;
          if (
            cat === 'Metal' &&
            sku &&
            row.cost_per_unit == null &&
            row.price_per_unit == null
          ) {
            skusForCatalog.add(String(sku));
          }
        }
        let metalCatalogBySku: MetalCatalogBySku = {};
        if (skusForCatalog.size > 0) {
          const { data: catRows, error: catErr } = await supabase
            .from('materials_catalog')
            .select('sku, purchase_cost, unit_price')
            .in('sku', [...skusForCatalog]);
          if (!catErr && catRows) {
            for (const row of catRows as {
              sku: string;
              purchase_cost: number | null;
              unit_price: number | null;
            }[]) {
              metalCatalogBySku[row.sku] = {
                purchase_cost: Number(row.purchase_cost) || 0,
                unit_price: Number(row.unit_price) || 0,
              };
            }
          }
        }

        function zohoLineMoneyInput(item: Record<string, unknown>) {
          return {
            category: String(item.category ?? ''),
            quantity: Number(item.quantity) || 0,
            length: (item.length ?? item.part_length ?? null) as string | null,
            cost_per_unit: item.cost_per_unit as number | null | undefined,
            price_per_unit: item.price_per_unit as number | null | undefined,
            extended_cost: item.extended_cost as number | null | undefined,
            extended_price: item.extended_price as number | null | undefined,
            sku: item.sku as string | null | undefined,
          };
        }

        // Create Sales Order (if requested)
        if (!orderType || orderType === 'both' || orderType === 'sales_order') {
          console.log('📋 Creating Sales Order...');
          
          // Use "Martin Builder" as the customer (not the job name)
          const customerId = await findOrCreateCustomer(accessToken, settings.countywide_org_id, 'Martin Builder');
          console.log('✅ Customer ID:', customerId);
          
          // Ensure all items exist in Zoho as sellable items
          // SKU is the defining factor - ensure material has SKU attached from catalog
          const lineItems = [];
          for (const item of itemsForOrders) {
            const row = item as Record<string, unknown>;
            const partLength = row.part_length ?? row.length ?? '';
            const trimmedLength = partLength ? String(partLength).trim() : '';
            const trimmedColor = row.color ? String(row.color).trim() : '';
            console.log('📦 Processing material for Sales Order - SKU:', row.sku, '- Name:', row.material_name, '- Part Length:', trimmedLength, '- Color:', trimmedColor);
            
            const itemId = await ensurePurchasableItem(
              accessToken,
              settings.countywide_org_id,
              item
            );

            const customFields: { label: string; value: string }[] = [];
            if (trimmedLength) customFields.push({ label: 'Part Length', value: trimmedLength });
            if (trimmedColor) customFields.push({ label: 'Color', value: trimmedColor });
            
            const billedQty = Number(row.quantity);
            const lineSell = getMaterialLineSellAndCost(zohoLineMoneyInput(row), metalCatalogBySku).price;
            const salesRate = zohoRateFromLineTotal(lineSell, billedQty);

            const lineItem: any = {
              item_id: itemId,
              name: row.material_name,
              quantity: billedQty > 0 ? billedQty : 1,
              rate: salesRate,
              unit: 'piece',
              description: row.material_name,
            };

            if (customFields.length > 0) lineItem.custom_fields = customFields;

            lineItems.push(lineItem);
          }
          
          const salesOrderData = {
            customer_id: customerId,
            reference_number: jobName, // Use job name as reference
            notes: notes || `Materials for ${jobName}`,
            line_items: lineItems,
          };

          const salesOrderUrl = `https://www.zohoapis.com/books/v3/salesorders?organization_id=${settings.countywide_org_id}`;
          let salesOrderResult: any = null;
          let salesOrderBodyText = '';
          for (let soAttempt = 0; soAttempt < 2; soAttempt++) {
            const salesOrderResponse = await fetch(salesOrderUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(salesOrderData),
            });

            salesOrderBodyText = await salesOrderResponse.text();
            try {
              salesOrderResult = JSON.parse(salesOrderBodyText);
            } catch {
              salesOrderResult = null;
            }
            const salesOrderZohoError =
              !salesOrderResponse.ok ||
              (salesOrderResult &&
                typeof salesOrderResult.code === 'number' &&
                salesOrderResult.code !== 0);
            if (!salesOrderZohoError) break;

            const isInactiveLineError =
              salesOrderResult?.code === 2007 &&
              Array.isArray(salesOrderResult.error_info) &&
              salesOrderResult.error_info.length > 0;
            if (soAttempt === 0 && isInactiveLineError) {
              const ids = new Set<string>();
              for (const rawId of salesOrderResult.error_info) {
                const zid = String(rawId).trim();
                if (zid) ids.add(zid);
              }
              for (const li of lineItems) {
                const lid = li?.item_id != null ? String(li.item_id).trim() : '';
                if (lid) ids.add(lid);
              }
              const activationErrors: string[] = [];
              for (const zid of ids) {
                try {
                  await reliableActivateZohoItem(accessToken, settings.countywide_org_id, zid);
                } catch (e: any) {
                  activationErrors.push(`${zid}: ${e?.message || String(e)}`);
                }
              }
              if (activationErrors.length === ids.size && ids.size > 0) {
                throw new Error(
                  `Could not re-activate Zoho items before retrying sales order: ${activationErrors.join(' | ')}`
                );
              }
              continue;
            }

            throw new Error(
              formatZohoLineOrderError('Sales Order', salesOrderBodyText, salesOrderResult)
            );
          }

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
            const partLength = item.part_length ?? item.length ?? '';
            const trimmedLength = partLength ? String(partLength).trim() : '';
            const trimmedColor = item.color ? String(item.color).trim() : '';
            console.log('📦 Processing material for Purchase Order - SKU:', item.sku, '- Name:', item.material_name, '- Part Length:', trimmedLength, '- Color:', trimmedColor);
            
            const itemId = await ensurePurchasableItem(
              accessToken,
              settings.countywide_org_id,
              item
            );

            const customFields: { label: string; value: string }[] = [];
            if (trimmedLength) customFields.push({ label: 'Part Length', value: trimmedLength });
            if (trimmedColor) customFields.push({ label: 'Color', value: trimmedColor });

            const lineItem: any = {
              item_id: itemId,
              name: item.material_name,
              quantity: item.quantity,
              rate: item.cost_per_unit || item.price_per_unit || 0,
              unit: 'piece',
              description: item.material_name,
            };

            if (customFields.length > 0) lineItem.custom_fields = customFields;

            lineItems.push(lineItem);
          }
          
          const purchaseOrderData = {
            vendor_id: vendorId,
            reference_number: `Job: ${jobName}`,
            notes: notes || `Materials for ${jobName}`,
            line_items: lineItems,
          };

          const purchaseOrderUrl = `https://www.zohoapis.com/books/v3/purchaseorders?organization_id=${settings.countywide_org_id}`;
          let purchaseOrderResult: any = null;
          let purchaseOrderBodyText = '';
          for (let poAttempt = 0; poAttempt < 2; poAttempt++) {
            const purchaseOrderResponse = await fetch(purchaseOrderUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(purchaseOrderData),
            });

            purchaseOrderBodyText = await purchaseOrderResponse.text();
            try {
              purchaseOrderResult = JSON.parse(purchaseOrderBodyText);
            } catch {
              purchaseOrderResult = null;
            }
            const purchaseOrderZohoError =
              !purchaseOrderResponse.ok ||
              (purchaseOrderResult &&
                typeof purchaseOrderResult.code === 'number' &&
                purchaseOrderResult.code !== 0);
            if (!purchaseOrderZohoError) break;

            const isInactiveLineError =
              purchaseOrderResult?.code === 2007 &&
              Array.isArray(purchaseOrderResult.error_info) &&
              purchaseOrderResult.error_info.length > 0;
            if (poAttempt === 0 && isInactiveLineError) {
              const ids = new Set<string>();
              for (const rawId of purchaseOrderResult.error_info) {
                const zid = String(rawId).trim();
                if (zid) ids.add(zid);
              }
              for (const li of lineItems) {
                const lid = li?.item_id != null ? String(li.item_id).trim() : '';
                if (lid) ids.add(lid);
              }
              const activationErrors: string[] = [];
              for (const zid of ids) {
                try {
                  await reliableActivateZohoItem(accessToken, settings.countywide_org_id, zid);
                } catch (e: any) {
                  activationErrors.push(`${zid}: ${e?.message || String(e)}`);
                }
              }
              if (activationErrors.length === ids.size && ids.size > 0) {
                throw new Error(
                  `Could not re-activate Zoho items before retrying purchase order: ${activationErrors.join(' | ')}`
                );
              }
              continue;
            }

            throw new Error(
              formatZohoLineOrderError('Purchase Order', purchaseOrderBodyText, purchaseOrderResult)
            );
          }

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
    const details = error?.message || String(error);
    const isAuthError = /token|refresh|unauthorized|invalid_grant|expired|credentials/i.test(details);
    const errorMessage = isAuthError
      ? 'Zoho authentication failed. Check your Zoho Books credentials and re-authorize in Settings.'
      : 'Zoho sync failed';
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: details,
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

/** Fetch chart of accounts and return map of account_id -> account_name for category lookup. */
async function fetchChartOfAccounts(accessToken: string, orgId: string, maxPages = 50): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= maxPages) {
    const url = `https://www.zohoapis.com/books/v3/chartofaccounts?organization_id=${orgId}&page=${page}&per_page=200`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
    });
    if (!res.ok) {
      console.warn('⚠️ Chart of accounts fetch failed:', res.status);
      break;
    }
    const data = await res.json();
    const accounts = data.chartofaccounts || data.accounts || [];
    for (const acc of accounts) {
      const id = acc.account_id;
      const name = acc.account_name;
      if (id && name) map.set(String(id), String(name));
    }
    hasMore = data.page_context?.has_more_page === true;
    page++;
  }
  return map;
}

/** Category from Zoho item: use account info (e.g. "Lumber Sales") and normalize to drop " Sales". Resolve account_id via chart of accounts when provided. */
function getCategoryFromZohoItem(item: any, accountIdToName?: Map<string, string>): string {
  let raw = item.account_name || item.account || item.sales_account_name || '';
  if (!raw && item.account_id && accountIdToName) {
    raw = accountIdToName.get(String(item.account_id)) || '';
  }
  raw = raw || item.category || item.item_type || '';
  let category = String(raw).trim();
  if (!category) return 'General';
  // Prefer account-based over generic item_type; normalize "Lumber Sales" -> "Lumber"
  category = category.replace(/\s*Sales\s*$/i, '').trim();
  if (!category || /^(sales|purchases|sales_and_purchases|inventory)$/i.test(category)) {
    category = item.category || item.item_type || 'General';
    category = String(category).replace(/\s*Sales\s*$/i, '').trim() || category;
  }
  return category || 'General';
}

/** Extract part length from a Zoho Books item. Must NOT use usage unit (pcs, Bag, etc.) — only actual length from custom fields or item fields. */
function getPartLengthFromZohoItem(item: any): string | null {
  const unitLike = /^(pcs|pc|bag|bags|lf|ft|piece|pieces|ea|each|units?|linear\s*ft)$/i;
  const looksLikeLength = (v: string) => v && String(v).trim() !== '' && /[\d'"\sft\.\-]/.test(String(v)) && !unitLike.test(String(v).trim());

  const accept = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s !== '' && !unitLike.test(s) ? s : null;
  };

  // Top-level fields (some APIs expose custom fields as item["Part Length"])
  if (accept(item.part_length)) return accept(item.part_length);
  if (accept(item.partLength)) return accept(item.partLength);
  if (accept(item.cf_part_length)) return accept(item.cf_part_length);
  if (accept(item.cf_partlength)) return accept(item.cf_partlength);
  if (accept(item.length)) return accept(item.length);
  const partLengthKey = Object.keys(item || {}).find((k) => /part[\s_-]*length/i.test(k));
  if (partLengthKey && accept(item[partLengthKey])) return accept(item[partLengthKey]);
  if (item['Part Length'] != null && accept(item['Part Length'])) return accept(item['Part Length']);

  // custom_fields array (may have label, name, or only value)
  const customFields = item.custom_fields || [];
  for (const cf of customFields) {
    const label = String(cf.label || cf.name || cf.api_name || '').trim().toLowerCase();
    const value = cf.value != null ? String(cf.value).trim() : '';
    const valueFormatted = cf.value_formatted != null ? String(cf.value_formatted).trim() : '';
    if (!value) continue;
    if (label === 'part length' || label === 'partlength' || label === 'cf_part_length' || /part[\s_-]*length/.test(label)) {
      if (!unitLike.test(value)) return value;
      if (valueFormatted && !unitLike.test(valueFormatted)) return valueFormatted;
      return null;
    }
    if (looksLikeLength(value)) return value;
    if (valueFormatted && looksLikeLength(valueFormatted)) return valueFormatted;
  }
  // If only one custom field and it looks like a length, use it (API often omits label in list)
  if (customFields.length === 1 && customFields[0].value != null) {
    const v = String(customFields[0].value).trim();
    if (looksLikeLength(v)) return v;
  }
  // Any custom field value that is a plain number (e.g. "14") — treat as part length
  for (const cf of customFields) {
    const value = cf.value != null ? String(cf.value).trim() : '';
    if (value && /^\d+(\.\d+)?$/.test(value) && !unitLike.test(value)) return value;
  }
  return null;
}

/** Treat inactive Zoho items as not importable into materials catalog. */
function isZohoItemActive(item: any): boolean {
  if (!item || typeof item !== 'object') return true;
  const status = String(item.status || item.item_status || '').trim().toLowerCase();
  if (status === 'inactive') return false;
  if (status === 'active') return true;
  if (item.is_active === false || item.is_active === 'false') return false;
  if (item.is_active === true || item.is_active === 'true') return true;
  if (item.is_inactive === true) return false;
  if (item.inactive === true) return false;
  // List/search may omit status — treat as active for catalog import; orders use GET + reactivateZohoItemIfNeeded.
  return true;
}

function formatZohoLineOrderError(
  kind: 'Sales Order' | 'Purchase Order',
  raw: string,
  parsed: any | null
): string {
  const code = parsed && typeof parsed.code === 'number' ? parsed.code : undefined;
  const message = parsed && parsed.message != null ? String(parsed.message) : '';
  const errorInfo =
    parsed && Array.isArray(parsed.error_info)
      ? parsed.error_info.map((x: unknown) => String(x))
      : [];
  const inactive =
    code === 2007 ||
    /inactive items cannot be added/i.test(message) ||
    /inactive items cannot be added/i.test(raw);
  if (inactive) {
    const ids = errorInfo.length ? errorInfo.join(', ') : '';
    return `Failed to create ${kind}: Inactive Zoho item(s) cannot be on this order${ids ? ` (Zoho item id: ${ids})` : ''}. In Zoho Books → Items, mark those items Active, then try again. Response: ${raw}`;
  }
  return `Failed to create ${kind}: ${raw}`;
}

/**
 * When Zoho returns multiple rows for one SKU, prefer explicitly active, then unknown status, last inactive.
 * (Previously we used find(isZohoItemActive) which treats missing status as active and could pick an inactive row first.)
 */
function pickBestZohoItemRowForOrder(items: any[]): any {
  if (!items.length) return items[0];
  const rank = (it: any): number => {
    const s = String(it?.status ?? it?.item_status ?? '').trim().toLowerCase();
    if (s === 'active') return 0;
    if (s === 'inactive') return 2;
    return 1;
  };
  return [...items].sort((a, b) => rank(a) - rank(b))[0];
}

/**
 * Zoho 2007: inactive line items. POST /items/{id}/active may fail or be unsupported; fall back to PUT from GET item.
 */
async function reliableActivateZohoItem(
  accessToken: string,
  orgId: string,
  itemId: string
): Promise<void> {
  const encId = encodeURIComponent(itemId);
  const org = encodeURIComponent(orgId);
  const postUrl = `https://www.zohoapis.com/books/v3/items/${encId}/active?organization_id=${org}`;
  const postRes = await fetch(postUrl, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const postText = await postRes.text();
  let postData: any = {};
  try {
    postData = JSON.parse(postText);
  } catch {
    /* non-JSON */
  }
  if (postRes.ok && postData.code === 0) {
    console.log('✅ Zoho item POST /active:', itemId);
    return;
  }
  const postMsg = String(postData.message ?? postText).toLowerCase();
  if (postRes.ok && /already|not\s*inactive|no\s*change/i.test(postMsg)) {
    console.log('✅ Zoho item treat as active (POST):', itemId);
    return;
  }

  const detail = await fetchZohoItemDetails(accessToken, orgId, itemId);
  if (!detail) {
    throw new Error(
      `Cannot activate Zoho item ${itemId}: POST /active returned ${postText} and GET item failed`
    );
  }

  const putBody: Record<string, unknown> = {
    name: detail.name ?? 'Item',
    sku: detail.sku ?? '',
    rate: detail.rate ?? 0,
    purchase_rate: detail.purchase_rate ?? detail.cost_price ?? 0,
    unit: detail.unit || 'piece',
    description: detail.description ?? detail.name ?? '',
    item_type: detail.item_type || 'sales_and_purchases',
    status: 'active',
  };
  if (Array.isArray(detail.custom_fields) && detail.custom_fields.length > 0) {
    putBody.custom_fields = detail.custom_fields;
  }

  const putRes = await fetch(
    `https://www.zohoapis.com/books/v3/items/${encId}?organization_id=${org}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(putBody),
    }
  );
  const putText = await putRes.text();
  let putData: any = {};
  try {
    putData = JSON.parse(putText);
  } catch {
    /* non-JSON */
  }
  if (putRes.ok && putData.code === 0) {
    console.log('✅ Zoho item activated via PUT status=active:', itemId);
    return;
  }
  throw new Error(
    `Cannot activate Zoho item ${itemId} for sales order. POST /active: ${postText}; PUT: ${putText}`
  );
}

/** Before sales/PO lines: always ensure item is active (GET can omit inactive flag on list/search). */
async function reactivateZohoItemIfNeeded(
  accessToken: string,
  orgId: string,
  itemId: string
): Promise<void> {
  await reliableActivateZohoItem(accessToken, orgId, itemId);
}

function isImportedSkuValue(sku: unknown): boolean {
  if (sku == null) return false;
  return String(sku).trim().toLowerCase().startsWith('imported');
}

/** Fetch full item details from Zoho (includes custom_fields). Use when list response omits them. */
async function fetchZohoItemDetails(accessToken: string, orgId: string, itemId: string): Promise<any> {
  const url = `https://www.zohoapis.com/books/v3/items/${itemId}?organization_id=${orgId}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.item || null;
}

/** Fetch a single page of items from Zoho Books. Used for chunked sync to avoid timeout. */
async function fetchZohoItemsPage(
  accessToken: string,
  orgId: string,
  page: number,
  perPage = 100
): Promise<{ items: any[]; hasMore: boolean }> {
  const url = `https://www.zohoapis.com/books/v3/items?organization_id=${orgId}&page=${page}&per_page=${perPage}`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
  });
  if (!response.ok) {
    const errorText = await response.text();
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.code === 2 || errorJson.message?.includes('organization_id')) {
        throw new Error('Invalid Organization ID. Please check your Zoho Books Organization ID in Settings.');
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('Organization ID')) throw e;
    }
    throw new Error(`Failed to fetch Zoho items: ${errorText}`);
  }
  const data = await response.json();
  let pageItems = data.items;
  if (!Array.isArray(pageItems)) {
    pageItems = data.item != null ? (Array.isArray(data.item) ? data.item : [data.item]) : [];
  }
  const hasMore = !!data.page_context?.has_more_page;
  return { items: pageItems, hasMore };
}

async function fetchZohoItems(accessToken: string, orgId: string): Promise<any[]> {
  console.log('🌐 Fetching all items from Zoho Books with pagination...');
  let allItems: any[] = [];
  let page = 1;
  let hasMorePages = true;
  while (hasMorePages) {
    const { items: pageItems, hasMore } = await fetchZohoItemsPage(accessToken, orgId, page);
    allItems = allItems.concat(pageItems);
    hasMorePages = hasMore;
    page++;
    if (page > 50) break;
  }
  console.log(`📦 Fetched ${allItems.length} total items from ${page - 1} page(s)`);
  return allItems;
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
      const items = skuSearchData.items as any[];
      const skuMatch = pickBestZohoItemRowForOrder(items);
      console.log('✅ Found existing item by SKU:', skuMatch.item_id, '- SKU:', skuMatch.sku);

      await reactivateZohoItemIfNeeded(accessToken, orgId, skuMatch.item_id);

      // Update item to ensure it's purchasable and sellable with latest info from catalog
      await updateItemPurchasable(accessToken, orgId, skuMatch.item_id, materialItem, true);
      
      return skuMatch.item_id;
    }
  }

  // Item with this SKU doesn't exist in Zoho - create new one
  console.log('📝 Creating new item in Zoho Books - SKU:', sku, '- Name:', itemName);
  
  const partLength = materialItem.part_length ?? materialItem.length ?? '';
  const trimmedLength = partLength ? String(partLength).trim() : '';
  const trimmedColor = materialItem.color ? String(materialItem.color).trim() : '';
  const itemData: any = {
    name: itemName,
    sku: sku,
    description: itemName,
    rate: materialItem.price_per_unit || materialItem.cost_per_unit || 0,
    purchase_rate: materialItem.cost_per_unit || materialItem.price_per_unit || 0,
    unit: 'piece',
    is_taxable: materialItem.taxable !== false,
    tax_id: '',
    item_type: 'sales_and_purchases',
    status: 'active',
  };

  const itemCustomFields: { label: string; value: string }[] = [];
  if (trimmedLength) itemCustomFields.push({ label: 'Part Length', value: trimmedLength });
  if (trimmedColor) itemCustomFields.push({ label: 'Color', value: trimmedColor });
  if (itemCustomFields.length > 0) itemData.custom_fields = itemCustomFields;
  
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
  materialItem: any,
  throwOnError = false
): Promise<void> {
  console.log('🔄 Updating item to be purchasable:', itemId, '- SKU:', materialItem.sku);
  
  // Update with ALL information from the SKU in materials_catalog
  const partLength = materialItem.part_length ?? materialItem.length ?? '';
  const trimmedLength = partLength ? String(partLength).trim() : '';
  const trimmedColor = materialItem.color ? String(materialItem.color).trim() : '';
  const updateData: any = {
    name: materialItem.material_name,
    sku: materialItem.sku,
    rate: materialItem.price_per_unit || materialItem.cost_per_unit || 0,
    purchase_rate: materialItem.cost_per_unit || materialItem.price_per_unit || 0,
    unit: 'piece',
    description: materialItem.material_name,
    item_type: 'sales_and_purchases',
    status: 'active',
  };

  const updateCustomFields: { label: string; value: string }[] = [];
  if (trimmedLength) updateCustomFields.push({ label: 'Part Length', value: trimmedLength });
  if (trimmedColor) updateCustomFields.push({ label: 'Color', value: trimmedColor });
  if (updateCustomFields.length > 0) updateData.custom_fields = updateCustomFields;
  
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

  const errorText = await updateResponse.text();
  let respData: any = {};
  try {
    respData = JSON.parse(errorText);
  } catch {
    /* non-JSON */
  }
  const zohoOk =
    updateResponse.ok && (respData.code === undefined || respData.code === 0);
  if (!zohoOk) {
    const msg = `Failed to update Zoho item ${itemId}: ${errorText}`;
    console.warn('⚠️', msg);
    if (throwOnError) throw new Error(msg);
    return;
  }
  console.log('✅ Item updated to be purchasable');
}
