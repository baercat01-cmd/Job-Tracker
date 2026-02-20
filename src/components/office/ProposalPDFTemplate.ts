// PDF Template for Proposal Export
export function generateProposalHTML(data: {
  proposalNumber: string;
  date: string;
  job: {
    client_name: string;
    address: string;
    name: string;
    customer_phone?: string;
    description?: string;
  };
  sections: Array<{
    name: string;
    description: string;
    price?: number;
    items?: Array<{ description: string; price?: number; quantity?: number; unit?: string }>;
  }>;
  totals: {
    materials: number;
    labor: number;
    subtotal: number;
    tax: number;
    grandTotal: number;
  };
  showLineItems: boolean;
  showSectionPrices?: boolean; // Option to show/hide individual section prices (customer version - defaults to false)
  showInternalDetails?: boolean; // Option to show all row items with individual prices (Office View - internal use only)
}): string {
  const { proposalNumber, date, job, sections, totals, showLineItems, showSectionPrices = false, showInternalDetails = false } = data;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: Arial, sans-serif; 
            line-height: 1.3; 
            color: #000; 
            max-width: 940px; 
            margin: 0 auto; 
            padding: 15px 30px; 
            font-size: 11pt; 
          }
          
          .header-row { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-start; 
            margin-bottom: 15px;
          }
          
          .logo-section { flex: 1; }
          
          .company-logo { 
            width: 192px; 
            height: auto; 
            margin-bottom: 10px; 
          }
          
          .company-address { font-size: 11pt; margin-bottom: 3px; }
          .company-contact { font-size: 10pt; margin-bottom: 2px; }
          
          .proposal-header { text-align: right; }
          .proposal-title { font-size: 32pt; font-weight: bold; margin-bottom: 5px; }
          
          .proposal-info-table { 
            border: 1px solid #000; 
            border-collapse: collapse; 
            margin-left: auto; 
          }
          
          .proposal-info-table th, 
          .proposal-info-table td { 
            border: 1px solid #000; 
            padding: 8px 15px; 
            text-align: center; 
            font-size: 11pt;
          }
          
          .proposal-info-table th { font-weight: bold; }
          
          .customer-section { margin: 15px 0; }
          
          .info-box { 
            border: 1px solid #000; 
            padding: 10px; 
            margin-bottom: 10px; 
          }
          
          .box-header { 
            background: #f0f0f0; 
            border-bottom: 1px solid #000; 
            padding: 5px 10px; 
            margin: -10px -10px 10px -10px; 
            font-weight: bold; 
          }
          
          .customer-row { display: flex; gap: 10px; }
          .customer-left { flex: 1; }
          .customer-right { width: 300px; }
          
          .intro-box { 
            border: 2px solid #000; 
            padding: 0;
            margin: 15px 0; 
          }
          
          .section-title { 
            font-weight: bold; 
            font-size: 12pt;
            margin-top: 20px; 
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
            align-items: baseline;
          }
          
          .section-content { 
            margin-left: 0; 
            margin-bottom: 15px; 
            white-space: pre-wrap;
            line-height: 1.5;
            color: #333;
          }
          
          .section-wrapper {
            page-break-inside: avoid;
            margin-bottom: 20px;
          }
          
          .section-price {
            font-weight: bold;
            color: #000;
            margin-left: 20px;
          }

          .items-table {
            width: 100%;
            margin: 10px 0;
            border-collapse: collapse;
            font-size: 9.5pt;
            border: 1px solid #ddd;
          }

          .items-table thead tr {
            border-bottom: 2px solid #333;
            background: #e8f4e8;
          }

          .items-table th {
            text-align: left;
            padding: 10px 8px;
            font-weight: bold;
            color: #2d5f3f;
            font-size: 9pt;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .items-table tbody tr {
            border-bottom: 1px solid #e0e0e0;
          }

          .items-table tbody tr:hover {
            background: #f9f9f9;
          }

          .items-table td {
            padding: 8px;
            vertical-align: top;
          }

          .items-table .total-row {
            border-top: 3px double #2d5f3f;
            font-weight: bold;
            background: #e8f4e8;
          }

          .items-table .total-row td {
            padding: 12px 8px;
          }
          
          .footer { margin-top: 30px; font-size: 9pt; }
          .signature-section { margin-top: 20px; }
          .signature-line { 
            border-top: 1px solid #000; 
            width: 250px; 
            margin-top: 30px; 
          }
          
          table { width: 100%; }
          
          /* Page numbering and proposal number at bottom */
          .page-footer {
            position: fixed;
            bottom: 20px;
            left: 0;
            right: 0;
            color: #999;
            font-size: 9pt;
            z-index: 1000;
            display: flex;
            justify-content: space-between;
            padding: 0 60px;
          }
          
          .page-footer .proposal-number {
            font-weight: 600;
          }
          
          .page-footer .page-number {
            text-align: right;
          }
          
          @page {
            margin-top: 50px;
            margin-bottom: 60px;
          }
          
          @media print {
            body { 
              -webkit-print-color-adjust: exact; 
              print-color-adjust: exact;
              counter-reset: page 1;
            }
            .page-break { page-break-after: always; }
            
            .page-footer .page-number::after {
              content: "Page " counter(page);
            }
          }
          
          @media screen {
            .page-footer .page-number::after {
              content: "Page numbers will appear in print view";
            }
            .page-footer {
              position: relative;
              bottom: auto;
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #e0e0e0;
            }
          }
        </style>
      </head>
      <body>
        <!-- Page Footer - shows proposal number and page number at bottom -->
        <div class="page-footer">
          <div class="proposal-number">Proposal #${proposalNumber}</div>
          <div class="page-number"></div>
        </div>
        
        <!-- Main Content -->
        <div class="header-row">
          <div class="logo-section">
            <img src="https://cdn-ai.onspace.ai/onspace/files/4ZzeFr2RKnB7oAxZwNpsZR/MB_Logo_Green_192x64_12.9kb.png" alt="Martin Builder" class="company-logo" />
            <div class="company-address">27608-A CR 36</div>
            <div class="company-address">Goshen, IN 46526</div>
            <div class="company-contact">Phone: 574-862-4448</div>
            <div class="company-contact">Fax: 574-862-1548</div>
            <div class="company-contact">Email: office@martinbuilder.net</div>
          </div>
          
          <div class="proposal-header">
            <div class="proposal-title">Proposal</div>
            <table class="proposal-info-table">
              <tr>
                <th>Date</th>
                <th>Proposal #</th>
              </tr>
              <tr>
                <td>${date}</td>
                <td>${proposalNumber}</td>
              </tr>
            </table>
          </div>
        </div>
        
        <div class="customer-section">
          <div class="customer-row">
            <div class="customer-left">
              <div class="info-box">
                <div class="box-header">Name / Address</div>
                <div>${job.client_name}</div>
                <div>${job.address}</div>
                <div style="margin-top: 8px;">${job.customer_phone || 'N/A'}</div>
              </div>
            </div>
            
            <div class="customer-right">
              <div class="info-box">
                <div class="box-header">Project</div>
                <div>${job.name}</div>
              </div>
            </div>
          </div>
        </div>
        
        <p style="margin: 20px 0; font-size: 11pt; line-height: 1.6;">
          We hereby submit specifications and estimates for: Thanks for requesting a Martin Builder building quotation. We propose to furnish material, labor and equipment as described below:
        </p>
        
        <div class="intro-box" style="margin-top: 10px;">
          <div class="box-header">Work to be Completed</div>
          <div style="padding: 15px 10px 10px 10px;">
            ${job.description ? '<div style="margin-bottom: 20px; padding: 12px; background: #f9f9f9; border-left: 4px solid #2d5f3f; font-size: 11pt; line-height: 1.6;">' + job.description + '</div>' : ''}
            ${sections.map((section: any) => {
              let content = '<div class="section-wrapper">';
              
              if (showInternalDetails) {
                // OFFICE VIEW: Show section name with price, description, and all items with individual unit and total prices
                content += '<div class="section-title" style="margin-top: 15px;">';
                content += '<span style="font-weight: bold; font-size: 13pt;">' + section.name + '</span>';
                if (section.price) {
                  content += '<span class="section-price" style="font-weight: bold; font-size: 13pt;">$' + section.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '</span>';
                }
                content += '</div>';
                
                // Show description first if exists
                if (section.description) {
                  content += '<div class="section-content" style="margin: 8px 0 15px 0; padding: 10px; background: #f9f9f9; border-left: 3px solid #2d5f3f;">' + section.description + '</div>';
                }
                
                // Show all sub-items with individual prices in a detailed table
                if (section.items && section.items.length > 0) {
                  content += '<div style="margin: 10px 0 20px 0;">';
                  content += '<p style="font-size: 10pt; font-weight: 600; color: #666; margin-bottom: 8px;">LINE ITEM BREAKDOWN:</p>';
                  content += '<table class="items-table"><thead><tr>';
                  content += '<th style="width: 45%;">Item Description</th>';
                  content += '<th style="width: 15%; text-align: center;">Quantity</th>';
                  content += '<th style="width: 20%; text-align: right;">Unit Price</th>';
                  content += '<th style="width: 20%; text-align: right;">Total Price</th>';
                  content += '</tr></thead><tbody>';
                  
                  section.items.forEach((item: any) => {
                    const qty = item.quantity || 1;
                    const totalPrice = item.price || 0;
                    const unitPrice = qty > 0 ? totalPrice / qty : totalPrice;
                    content += '<tr>';
                    content += '<td style="padding: 8px;">' + item.description + '</td>';
                    content += '<td style="text-align: center; padding: 8px;">' + qty + (item.unit ? ' ' + item.unit : '') + '</td>';
                    content += '<td style="text-align: right; padding: 8px;">$' + unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '</td>';
                    content += '<td style="text-align: right; padding: 8px; font-weight: 600;">$' + totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '</td>';
                    content += '</tr>';
                  });
                  
                  content += '<tr class="total-row">';
                  content += '<td colspan="3" style="text-align: right; font-weight: bold; padding: 10px 8px; background: #f0f0f0;">Section Total:</td>';
                  content += '<td style="text-align: right; font-weight: bold; padding: 10px 8px; background: #f0f0f0; font-size: 11pt;">$' + (section.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) + '</td>';
                  content += '</tr>';
                  content += '</tbody></table>';
                  content += '</div>';
                }
              } else {
                // CUSTOMER VERSION: Only show section name (with optional price) and description
                // Do NOT show sub-items
                if (showSectionPrices && section.price) {
                  // Show section name with price on the right
                  content += '<div class="section-title" style="margin-top: 15px;">';
                  content += '<span>' + section.name + '</span>';
                  content += '<span class="section-price">$' + section.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '</span>';
                  content += '</div>';
                } else {
                  // Show section name only
                  content += '<div class="section-title" style="display: block; margin-top: 15px;">' + section.name + '</div>';
                }
                
                if (section.description) {
                  content += '<div class="section-content">' + section.description + '</div>';
                }
              }
              
              content += '</div>'; // Close section-wrapper
              return content;
            }).join('')}
          </div>
        </div>
        
        ${showInternalDetails ? `
          <!-- Office View - Summary Only (No Payment Terms) -->
          <div style="margin-top: 30px; padding: 20px; background: #f5f5f5; border: 2px solid #333; border-radius: 8px;">
            <h3 style="margin: 0 0 15px 0; font-size: 14pt;">Proposal Summary - Office View</h3>
            <table style="width: 100%;">
              ${totals.materials > 0 ? `
                <tr>
                  <td style="text-align: right; padding: 5px;"><strong>Materials & Subcontractors:</strong></td>
                  <td style="text-align: right; width: 150px; padding: 5px;">$${totals.materials.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                </tr>
              ` : ''}
              ${totals.labor > 0 ? `
                <tr>
                  <td style="text-align: right; padding: 5px;"><strong>Labor:</strong></td>
                  <td style="text-align: right; padding: 5px;">$${totals.labor.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                </tr>
              ` : ''}
              <tr>
                <td style="text-align: right; padding: 5px;"><strong>Subtotal:</strong></td>
                <td style="text-align: right; padding: 5px;">$${totals.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td style="text-align: right; padding: 5px;"><strong>Sales Tax (7%):</strong></td>
                <td style="text-align: right; padding: 5px;">$${totals.tax.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr style="border-top: 2px solid #333;">
                <td style="text-align: right; padding: 10px 5px 5px 5px;"><strong style="font-size: 12pt;">GRAND TOTAL:</strong></td>
                <td style="text-align: right; padding: 10px 5px 5px 5px;"><strong style="font-size: 14pt;">$${totals.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            </table>
          </div>
        ` : `
          <!-- Customer Version - Full Footer with Payment Terms -->
          <p style="margin-top: 30px; margin-bottom: 10px;">We Propose hereby to furnish material and labor, complete in accordance with the above specifications, for sum of:</p>
          
          <table style="margin-top: 15px;">
            <tr>
              <td style="text-align: right;"><strong>Subtotal:</strong></td>
              <td style="text-align: right; width: 150px;">$${totals.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <td style="text-align: right;"><strong>Sales Tax (7%):</strong></td>
              <td style="text-align: right;">$${totals.tax.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <td style="text-align: right; padding-top: 10px;"><strong>GRAND TOTAL:</strong></td>
              <td style="text-align: right; padding-top: 10px; font-size: 14pt;"><strong>$${totals.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
            </tr>
          </table>
          
          <div class="footer">
            <p style="margin-bottom: 10px;">Payment to be made as follows: 20% Down, 60% COD, 20% Final</p>
            
            <p style="margin-bottom: 15px;"><strong>Note:</strong> This proposal may be withdrawn by us if not accepted within 30 days.</p>
            
            <div class="signature-section">
              <p style="margin-bottom: 5px;"><strong>Acceptance of Proposal</strong></p>
              <p style="margin-bottom: 20px;">The above prices, specifications and conditions are satisfactory and are hereby accepted. You are authorized to do the work as specified. Payment will be made as outlined above.</p>
              
              <div style="display: flex; justify-content: space-between; margin-top: 40px;">
                <div>
                  <p>Authorized Signature</p>
                  <div class="signature-line"></div>
                </div>
                <div>
                  <p>Date of Acceptance</p>
                  <div class="signature-line"></div>
                </div>
              </div>
            </div>
          </div>
        `}
        

      </body>
    </html>
  `;
}
