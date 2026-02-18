import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const payload = await req.json();
    
    console.log('📨 Webhook received:', JSON.stringify(payload, null, 2));

    const { event_type, data } = payload;

    // Handle different webhook events
    switch (event_type) {
      case 'salesorder.deleted':
        await handleSalesOrderDeleted(supabase, data);
        break;
      
      case 'salesorder.updated':
        await handleSalesOrderUpdated(supabase, data);
        break;
      
      case 'purchaseorder.deleted':
        await handlePurchaseOrderDeleted(supabase, data);
        break;
      
      case 'purchaseorder.updated':
        await handlePurchaseOrderUpdated(supabase, data);
        break;
      
      case 'invoice.created':
        await handleInvoiceCreated(supabase, data);
        break;
      
      case 'item.updated':
      case 'item.created':
        await handleItemUpdated(supabase, data);
        break;
      
      default:
        console.log('⚠️ Unhandled webhook event:', event_type);
    }

    return new Response(
      JSON.stringify({ success: true, message: `Webhook processed: ${event_type}` }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('❌ Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

// Handle Sales Order deletion
async function handleSalesOrderDeleted(supabase: any, data: any) {
  console.log('🗑️ Handling Sales Order deletion:', data.salesorder_id);
  
  const { error } = await supabase
    .from('material_items')
    .update({
      zoho_sales_order_id: null,
      zoho_sales_order_number: null,
      updated_at: new Date().toISOString(),
    })
    .eq('zoho_sales_order_id', data.salesorder_id);

  if (error) {
    console.error('❌ Error clearing Sales Order reference:', error);
    throw error;
  }

  console.log('✅ Cleared Sales Order references for:', data.salesorder_number);
}

// Handle Sales Order updates
async function handleSalesOrderUpdated(supabase: any, data: any) {
  console.log('📝 Handling Sales Order update:', data.salesorder_id);
  
  // You can add logic here to sync specific fields if needed
  // For now, we just log the update
  console.log('ℹ️ Sales Order updated:', data.salesorder_number);
}

// Handle Purchase Order deletion
async function handlePurchaseOrderDeleted(supabase: any, data: any) {
  console.log('🗑️ Handling Purchase Order deletion:', data.purchaseorder_id);
  
  const { error } = await supabase
    .from('material_items')
    .update({
      zoho_purchase_order_id: null,
      zoho_purchase_order_number: null,
      updated_at: new Date().toISOString(),
    })
    .eq('zoho_purchase_order_id', data.purchaseorder_id);

  if (error) {
    console.error('❌ Error clearing Purchase Order reference:', error);
    throw error;
  }

  console.log('✅ Cleared Purchase Order references for:', data.purchaseorder_number);
}

// Handle Purchase Order updates
async function handlePurchaseOrderUpdated(supabase: any, data: any) {
  console.log('📝 Handling Purchase Order update:', data.purchaseorder_id);
  console.log('ℹ️ Purchase Order updated:', data.purchaseorder_number);
}

// Handle Invoice creation from Sales Order
async function handleInvoiceCreated(supabase: any, data: any) {
  console.log('🧾 Handling Invoice creation:', data.invoice_id);
  
  // Check if invoice was created from a Sales Order
  if (data.salesorder_id) {
    // Update material items to track invoice
    const { error } = await supabase
      .from('material_items')
      .update({
        zoho_invoice_id: data.invoice_id,
        zoho_invoice_number: data.invoice_number,
        updated_at: new Date().toISOString(),
      })
      .eq('zoho_sales_order_id', data.salesorder_id);

    if (error) {
      console.error('❌ Error linking invoice to materials:', error);
      throw error;
    }

    console.log('✅ Linked Invoice', data.invoice_number, 'to materials from SO', data.salesorder_number);
  }
}

// Handle Item (material) updates
async function handleItemUpdated(supabase: any, data: any) {
  console.log('📦 Handling Item update:', data.item_id);
  
  // Update materials_catalog if the item exists there
  const { error } = await supabase
    .from('materials_catalog')
    .update({
      material_name: data.name,
      unit_price: data.rate ? parseFloat(data.rate) : null,
      purchase_cost: data.purchase_rate ? parseFloat(data.purchase_rate) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('sku', data.sku);

  if (error && error.code !== 'PGRST116') { // Ignore "no rows updated" error
    console.error('❌ Error updating material catalog:', error);
    throw error;
  }

  console.log('✅ Updated material catalog for SKU:', data.sku);
}
