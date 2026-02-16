// PDF Template for Proposal Export
export function generateProposalHTML(data: {
  proposalNumber: string;
  date: string;
  job: {
    client_name: string;
    address: string;
    name: string;
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
  showSectionPrices?: boolean; // Option to show/hide individual section prices (customer version)
  showInternalDetails?: boolean; // Option to show all row items with prices (internal version)
}): string {
  const { proposalNumber, date, job, sections, totals, showLineItems, showSectionPrices = true, showInternalDetails = false } = data;

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
            max-width: 850px; 
            margin: 0 auto; 
            padding: 20px; 
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
          
          .phone-row { 
            border: 1px solid #000; 
            border-collapse: collapse; 
            width: 100%; 
            margin-bottom: 15px; 
          }
          
          .phone-row td { 
            border: 1px solid #000; 
            padding: 8px; 
          }
          
          .intro-box { 
            border: 1px solid #000; 
            padding: 10px; 
            margin: 15px 0; 
          }
          
          .intro-header { font-weight: bold; margin-bottom: 8px; }
          
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
          
          .section-price {
            font-weight: bold;
            color: #000;
            margin-left: 20px;
          }

          .items-table {
            width: 100%;
            margin: 10px 0;
            border-collapse: collapse;
            font-size: 10pt;
          }

          .items-table thead tr {
            border-bottom: 2px solid #333;
            background: #f5f5f5;
          }

          .items-table th {
            text-align: left;
            padding: 8px;
            font-weight: bold;
          }

          .items-table tbody tr {
            border-bottom: 1px solid #ddd;
          }

          .items-table td {
            padding: 6px 8px;
          }

          .items-table .total-row {
            border-top: 2px solid #333;
            font-weight: bold;
            background: #f9f9f9;
          }
          
          .footer { margin-top: 30px; font-size: 9pt; }
          .signature-section { margin-top: 20px; }
          .signature-line { 
            border-top: 1px solid #000; 
            width: 250px; 
            margin-top: 30px; 
          }
          
          table { width: 100%; }
          
          @media print {
            body { 
              -webkit-print-color-adjust: exact; 
              print-color-adjust: exact; 
            }
            .page-break { page-break-after: always; }
          }
        </style>
      </head>
      <body>
        <div class="header-row">
          <div class="logo-section">
            <img src="https://cdn-ai.onspace.ai/onspace/files/QwJSFWnThkgN7aV5mZzKdg/MB_Logo_Green_192x64_12.9kb.png" alt="Martin Builder" class="company-logo" />
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
              </div>
              
              <table class="phone-row">
                <tr>
                  <td style="width: 80px;"><strong>Phone</strong></td>
                  <td>(574) 532-3653</td>
                  <td style="width: 60px;"><strong>Fax</strong></td>
                  <td style="width: 150px;"></td>
                </tr>
              </table>
            </div>
            
            <div class="customer-right">
              <div class="info-box">
                <div class="box-header">Project</div>
                <div>${job.name}</div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="intro-box">
          <div class="intro-header">We hereby submit specifications and estimates for:</div>
          <div>Thanks for requesting a Martin Builder building quotation</div>
          <div style="margin-top: 8px;">We propose to furnish material, labor and equipment as described below</div>
        </div>
        
        ${sections.map((section: any) => {
          let content = '';
          
          if (showInternalDetails) {
            // INTERNAL VERSION: Show section name, all items with prices, and description
            content += `<div class="section-title" style="display: block;">${section.name}</div>`;
            
            // Show all sub-items with prices in a table
            if (section.items && section.items.length > 0) {
              content += `
                <table class="items-table">
                  <thead>
                    <tr>
                      <th style="width: 60%;">Item</th>
                      <th style="width: 20%; text-align: center;">Quantity</th>
                      <th style="width: 20%; text-align: right;">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${section.items.map((item: any) => `
                      <tr>
                        <td>${item.description}</td>
                        <td style="text-align: center;">${item.quantity || 1}${item.unit ? ' ' + item.unit : ''}</td>
                        <td style="text-align: right;">$${(item.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    `).join('')}
                    <tr class="total-row">
                      <td colspan="2" style="text-align: right;">Section Total:</td>
                      <td style="text-align: right;">$${(section.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  </tbody>
                </table>
              `;
            }
            
            if (section.description) {
              content += `<div class="section-content">${section.description}</div>`;
            }
          } else {
            // CUSTOMER VERSION: Only show section name (with optional price) and description
            // Do NOT show sub-items
            if (showSectionPrices && section.price) {
              // Show section name with price on the right
              content += `
                <div class="section-title">
                  <span>${section.name}</span>
                  <span class="section-price">$${section.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
              `;
            } else {
              // Show section name only
              content += `<div class="section-title" style="display: block;">${section.name}</div>`;
            }
            
            if (section.description) {
              content += `<div class="section-content">${section.description}</div>`;
            }
          }
          
          return content;
        }).join('')}
        
        <p style="margin-top: 30px; margin-bottom: 10px;">We Propose hereby to furnish material and labor, complete in accordance with the above specifications, for sum of:</p>
        
        ${showLineItems ? `
          <table style="margin-top: 15px;">
            <tr>
              <td style="text-align: right;"><strong>Materials & Subcontractors:</strong></td>
              <td style="text-align: right; width: 150px;">$${totals.materials.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
            ${totals.labor > 0 ? `
              <tr>
                <td style="text-align: right;"><strong>Labor:</strong></td>
                <td style="text-align: right;">$${totals.labor.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
            ` : ''}
            <tr>
              <td style="text-align: right;"><strong>Subtotal:</strong></td>
              <td style="text-align: right;">$${totals.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
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
        ` : `
          <p style="text-align: center; font-size: 16pt; font-weight: bold; margin: 20px 0;">$${totals.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
        `}
        
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
      </body>
    </html>
  `;
}
