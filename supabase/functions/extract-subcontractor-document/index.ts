import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { documentId, documentType, pdfUrl } = await req.json();

    console.log(`Processing ${documentType} document: ${documentId}`);
    console.log(`PDF URL: ${pdfUrl}`);

    // Update status to processing
    const table = documentType === 'estimate' 
      ? 'subcontractor_estimates' 
      : 'subcontractor_invoices';

    const { error: updateError } = await supabase
      .from(table)
      .update({ extraction_status: 'processing' })
      .eq('id', documentId);

    if (updateError) {
      console.error('Error updating status to processing:', updateError);
    }

    // Fetch the PDF content
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
    }

    const pdfBlob = await pdfResponse.blob();
    const pdfBase64 = await blobToBase64(pdfBlob);

    // Call OnSpace AI with the PDF
    const onspaceApiKey = Deno.env.get('ONSPACE_AI_API_KEY');
    const onspaceBaseUrl = Deno.env.get('ONSPACE_AI_BASE_URL');
    
    if (!onspaceApiKey) {
      throw new Error('ONSPACE_AI_API_KEY not configured');
    }
    if (!onspaceBaseUrl) {
      throw new Error('ONSPACE_AI_BASE_URL not configured');
    }

    console.log('Using OnSpace AI Base URL:', onspaceBaseUrl);

    const aiResponse = await fetch(`${onspaceBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${onspaceApiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: documentType === 'estimate' 
                  ? `Analyze this ENTIRE multi-page subcontractor estimate/quote PDF document. Process ALL pages and extract every piece of information.

IMPORTANT: This document may have multiple pages. You MUST read and extract data from EVERY page, not just the first page.

Return a JSON object with:
{
  "company_name": "Company name",
  "contact_name": "Contact person",
  "contact_email": "Email address",
  "contact_phone": "Phone number",
  "total_amount": 12345.67,
  "scope_of_work": "Detailed description of all work to be performed (combine info from all pages)",
  "notes": "Any additional notes, terms, or conditions (from all pages)",
  "exclusions": "What's not included (from all pages)",
  "line_items": [
    {
      "description": "Item description",
      "quantity": 10,
      "unit_price": 100.00,
      "total_price": 1000.00,
      "notes": "Optional notes"
    }
  ]
}

Extract EVERY line item from EVERY page with their descriptions, quantities, unit prices, and totals. If quantity or unit price is not specified, leave as null but ensure total_price is captured. Combine all line items from all pages into a single array. Return ONLY the JSON object, no other text.`
                  : `Analyze this ENTIRE multi-page subcontractor invoice PDF document. Process ALL pages and extract every piece of information.

IMPORTANT: This document may have multiple pages. You MUST read and extract data from EVERY page, not just the first page.

Return a JSON object with:
{
  "company_name": "Company name",
  "invoice_number": "Invoice number",
  "invoice_date": "YYYY-MM-DD",
  "total_amount": 12345.67,
  "line_items": [
    {
      "description": "Item description",
      "quantity": 10,
      "unit_price": 100.00,
      "total_price": 1000.00,
      "notes": "Optional notes"
    }
  ]
}

Extract EVERY line item from EVERY page. Combine all line items from all pages into a single array. Return ONLY the JSON object, no other text.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 16000,
        temperature: 0,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('OnSpace AI error response:', errorText);
      console.error('Status code:', aiResponse.status);
      console.error('Status text:', aiResponse.statusText);
      
      // Update status to failed
      await supabase
        .from(table)
        .update({ extraction_status: 'failed' })
        .eq('id', documentId);
      
      throw new Error(`OnSpace AI error (${aiResponse.status}): ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const extractedText = aiData.choices[0].message.content;
    
    console.log('AI Response:', extractedText);

    // Parse the JSON response
    let extractedData;
    try {
      // Try to extract JSON from the response (in case AI adds text around it)
      const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        extractedData = JSON.parse(extractedText);
      }
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      throw new Error('Failed to parse extracted data');
    }

    // Update the document with extracted data
    if (documentType === 'estimate') {
      await supabase
        .from('subcontractor_estimates')
        .update({
          company_name: extractedData.company_name,
          contact_name: extractedData.contact_name,
          contact_email: extractedData.contact_email,
          contact_phone: extractedData.contact_phone,
          total_amount: extractedData.total_amount,
          scope_of_work: extractedData.scope_of_work,
          notes: extractedData.notes,
          exclusions: extractedData.exclusions,
          extraction_status: 'completed',
          raw_extraction_data: extractedData,
        })
        .eq('id', documentId);

      // Insert line items
      if (extractedData.line_items && extractedData.line_items.length > 0) {
        const lineItems = extractedData.line_items.map((item: any, index: number) => ({
          estimate_id: documentId,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          notes: item.notes,
          order_index: index,
        }));

        await supabase
          .from('subcontractor_estimate_line_items')
          .insert(lineItems);
      }
    } else {
      await supabase
        .from('subcontractor_invoices')
        .update({
          company_name: extractedData.company_name,
          invoice_number: extractedData.invoice_number,
          invoice_date: extractedData.invoice_date,
          total_amount: extractedData.total_amount,
          extraction_status: 'completed',
          raw_extraction_data: extractedData,
        })
        .eq('id', documentId);

      // Insert line items
      if (extractedData.line_items && extractedData.line_items.length > 0) {
        const lineItems = extractedData.line_items.map((item: any, index: number) => ({
          invoice_id: documentId,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          notes: item.notes,
          order_index: index,
        }));

        await supabase
          .from('subcontractor_invoice_line_items')
          .insert(lineItems);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        extractedData,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('Error:', error);
    
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Helper function to convert blob to base64
async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
