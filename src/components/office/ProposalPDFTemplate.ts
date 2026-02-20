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
  showSectionPrices?: boolean;
  showInternalDetails?: boolean;
  templateSettings?: any; // Template customization settings
}): string {
  const { proposalNumber, date, job, sections, totals, showLineItems, showSectionPrices = false, showInternalDetails = false, templateSettings } = data;

  // Apply template settings or use defaults
  const t = templateSettings || {};
  const pageMarginTop = t.page_margin_top ?? 0.75;
  const pageMarginBottom = t.page_margin_bottom ?? 0.75;
  const pageMarginLeft = t.page_margin_left ?? 0.5;
  const pageMarginRight = t.page_margin_right ?? 0.5;
  const bodyPaddingTop = t.body_padding_top ?? 50;
  const bodyPaddingBottom = t.body_padding_bottom ?? 60;
  const bodyPaddingLeft = t.body_padding_left ?? 30;
  const bodyPaddingRight = t.body_padding_right ?? 30;
  const bodyFontSize = t.body_font_size ?? 11;
  const bodyLineHeight = t.body_line_height ?? 1.3;
  const sectionMarginTop = t.section_margin_top ?? 12;
  const sectionMarginBottom = t.section_margin_bottom ?? 6;
  const sectionPaddingBottom = t.section_padding_bottom ?? 4;
  const sectionMinHeight = t.section_min_height ?? 60;
  const proposalTitleSize = t.proposal_title_size ?? 32;
  const sectionTitleSize = t.section_title_size ?? 12;
  const introText = t.intro_text ?? 'We hereby submit specifications and estimates for: Thanks for requesting a Martin Builder building quotation. We propose to furnish material, labor and equipment as described below:';
  const paymentText = t.payment_text ?? 'Payment to be made as follows: 20% Down, 60% COD, 20% Final';
  const acceptanceText = t.acceptance_text ?? 'The above prices, specifications and conditions are satisfactory and are hereby accepted. You are authorized to do the work as specified. Payment will be made as outlined above.';
  const companyName = t.company_name ?? 'Martin Builder';
  const companyAddress1 = t.company_address_1 ?? '27608-A CR 36';
  const companyAddress2 = t.company_address_2 ?? 'Goshen, IN 46526';
  const companyPhone = t.company_phone ?? '574-862-4448';
  const companyFax = t.company_fax ?? '574-862-1548';
  const companyEmail = t.company_email ?? 'office@martinbuilder.net';
  const companyLogoUrl = t.company_logo_url ?? 'https://cdn-ai.onspace.ai/onspace/files/4ZzeFr2RKnB7oAxZwNpsZR/MB_Logo_Green_192x64_12.9kb.png';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: Arial, sans-serif; 
            line-height: ${bodyLineHeight}; 
            color: #000; 
            max-width: 940px; 
            margin: 0 auto; 
            padding: ${bodyPaddingTop}px ${bodyPaddingRight}px ${bodyPaddingBottom}px ${bodyPaddingLeft}px; 
            font-size: ${bodyFontSize}pt;
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
          
          .company-address { font-size: ${bodyFontSize}pt; margin-bottom: 3px; }
          .company-contact { font-size: ${bodyFontSize - 1}pt; margin-bottom: 2px; }
          
          .proposal-header { text-align: right; }
          .proposal-title { font-size: ${proposalTitleSize}pt; font-weight: bold; margin-bottom: 5px; }
          
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
            font-size: ${bodyFontSize}pt;
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
            font-size: ${sectionTitleSize}pt;
            margin-top: ${sectionMarginTop}px; 
            margin-bottom: ${sectionMarginBottom}px;
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
            margin-bottom: 8px;
            min-height: ${sectionMinHeight}px;
            padding-bottom: ${sectionPaddingBottom}px;
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
          
          /* Terms and Conditions Page */
          .terms-page {
            page-break-before: always;
            padding-top: 40px;
          }
          
          .terms-header {
            text-align: center;
            margin-bottom: 25px;
            border-bottom: 2px solid #2d5f3f;
            padding-bottom: 15px;
          }
          
          .terms-title {
            font-size: 20pt;
            font-weight: bold;
            color: #2d5f3f;
            margin-bottom: 15px;
          }
          
          .terms-reference {
            font-size: 10pt;
            color: #666;
            margin-bottom: 3px;
          }
          
          .terms-content {
            font-size: 10pt;
            line-height: 1.6;
            color: #333;
          }
          
          .terms-section {
            margin-bottom: 15px;
          }
          
          .terms-section-title {
            font-weight: bold;
            color: #2d5f3f;
            margin-bottom: 6px;
            font-size: 10pt;
          }
          
          .terms-section-text {
            margin-left: 0;
            text-align: justify;
          }
          
          .terms-signature-section {
            margin-top: 30px;
          }
          
          .terms-signature-intro {
            margin-bottom: 25px;
            font-size: 10pt;
            font-weight: 600;
          }
          
          .terms-signature-line {
            border-top: 1px solid #333;
            width: 300px;
            margin-top: 40px;
          }
          
          .terms-signature-row {
            display: flex;
            justify-content: space-between;
            margin-top: 35px;
          }
          
          .terms-signature-block {
            width: 45%;
          }
          
          .terms-signature-label {
            font-size: 10pt;
            margin-bottom: 5px;
            font-weight: 600;
          }
          
          table { width: 100%; }
          
          /* Print page setup */
          @page {
            margin: ${pageMarginTop}in ${pageMarginRight}in ${pageMarginBottom}in ${pageMarginLeft}in;
            size: letter;
          }
          
          @page:first {
            counter-reset: page 1;
          }
          
          /* Fixed footer for page numbers - will appear on every printed page */
          .print-footer {
            position: fixed;
            bottom: 0.1in;
            left: 0;
            right: 0;
            height: 0.3in;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 0.5in;
            font-size: 9pt;
            color: #666;
            font-weight: 600;
            z-index: 9999;
            background: transparent;
          }
          
          .print-footer::before {
            content: "Proposal #${proposalNumber}";
          }
          
          .print-footer::after {
            content: "Page " counter(page);
          }
          
          @media print {
            body { 
              -webkit-print-color-adjust: exact; 
              print-color-adjust: exact;
            }
            .print-footer {
              display: flex;
            }
          }
          
          @media screen {
            .print-footer {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <!-- Print Footer - appears on every page -->
        <div class="print-footer"></div>
        
        <!-- Main Content -->
        <div class="header-row">
          <div class="logo-section">
            <img src="${companyLogoUrl}" alt="${companyName}" class="company-logo" />
            <div class="company-address">${companyAddress1}</div>
            <div class="company-address">${companyAddress2}</div>
            <div class="company-contact">Phone: ${companyPhone}</div>
            <div class="company-contact">Fax: ${companyFax}</div>
            <div class="company-contact">Email: ${companyEmail}</div>
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
        
        <p style="margin: 20px 0; font-size: ${bodyFontSize}pt; line-height: 1.6;">
          ${introText}
        </p>
        
        ${job.description && job.description.trim() ? `
        <div class="intro-box" style="margin-top: 10px; margin-bottom: 15px;">
          <div class="box-header">Building Description</div>
          <div style="padding: 15px 10px 10px 10px;">
            <div style="padding: 12px; background: #f9f9f9; border-left: 4px solid #2d5f3f; font-size: ${bodyFontSize}pt; line-height: 1.6;">${job.description}</div>
          </div>
        </div>
        ` : ''}
        
        <div class="intro-box" style="margin-top: 10px;">
          <div class="box-header">Work to be Completed</div>
          <div style="padding: 15px 10px 10px 10px;">
            ${sections.map((section: any) => {
              let content = '<div class="section-wrapper">';
              
              if (showInternalDetails) {
                content += '<div class="section-title" style="margin-top: 15px;">';
                content += '<span style="font-weight: bold; font-size: ' + (sectionTitleSize + 1) + 'pt;">' + section.name + '</span>';
                if (section.price) {
                  content += '<span class="section-price" style="font-weight: bold; font-size: ' + (sectionTitleSize + 1) + 'pt;">$' + section.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '</span>';
                }
                content += '</div>';
                
                if (section.description) {
                  content += '<div class="section-content" style="margin: 8px 0 15px 0; padding: 10px; background: #f9f9f9; border-left: 3px solid #2d5f3f;">' + section.description + '</div>';
                }
                
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
                  content += '<td style="text-align: right; font-weight: bold; padding: 10px 8px; background: #f0f0f0; font-size: ' + bodyFontSize + 'pt;">$' + (section.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) + '</td>';
                  content += '</tr>';
                  content += '</tbody></table>';
                  content += '</div>';
                }
              } else {
                if (showSectionPrices && section.price) {
                  content += '<div class="section-title" style="margin-top: 15px;">';
                  content += '<span>' + section.name + '</span>';
                  content += '<span class="section-price">$' + section.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) + '</span>';
                  content += '</div>';
                } else {
                  content += '<div class="section-title" style="display: block; margin-top: 15px;">' + section.name + '</div>';
                }
                
                if (section.description) {
                  content += '<div class="section-content">' + section.description + '</div>';
                }
              }
              
              content += '</div>';
              return content;
            }).join('')}
          </div>
        </div>
        
        ${showInternalDetails ? `
          <!-- Office View - Summary Only -->
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
          
          <div class="terms-page">
            <div class="terms-header">
              <div class="terms-title">Standard Terms and Conditions</div>
              <div class="terms-reference">Proposal #${proposalNumber} | ${job.name} | ${job.client_name}</div>
              <div class="terms-reference">Contract Amount: $${totals.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            </div>
            <div class="terms-content">
              <div class="terms-section">
                <div class="terms-section-title">Change Orders:</div>
                <div class="terms-section-text">Any additions or deviations from the original scope involving extra costs for labor or materials will be executed only upon a written Change Order, signed by both ${companyName} and the Customer.</div>
              </div>
              <div class="terms-section">
                <div class="terms-section-title">Site Conditions:</div>
                <div class="terms-section-text">The contract price assumes normal soil conditions. If subsurface obstructions (e.g., rock, utilities, high water) are encountered, the Customer is responsible for additional excavation costs.</div>
              </div>
              <div class="terms-section">
                <div class="terms-section-title">Permits:</div>
                <div class="terms-section-text">Unless otherwise noted, the Customer is responsible for all building permits, zoning fees, and utility hookups.</div>
              </div>
              <div class="terms-section">
                <div class="terms-section-title">Payment Schedule:</div>
                <div class="terms-section-text">${paymentText}</div>
              </div>
              <div class="terms-section">
                <div class="terms-section-title">Site Access:</div>
                <div class="terms-section-text">Customer must provide clear, unobstructed access for heavy equipment and delivery trucks to the build site.</div>
              </div>
              <div class="terms-section">
                <div class="terms-section-title">Insurance:</div>
                <div class="terms-section-text">${companyName} carries General Liability and Workers' Comp. Customer is responsible for 'Course of Construction' insurance once materials are delivered.</div>
              </div>
              <div class="terms-section">
                <div class="terms-section-title">Workmanship Warranty:</div>
                <div class="terms-section-text">${companyName} warrants workmanship for one (1) year. Manufacturer warranties apply to steel panels, doors, and hardware.</div>
              </div>
              <div class="terms-signature-section">
                <div class="terms-signature-intro">
                  By signing below, the Customer acknowledges having read, understood, and agreed to these Standard Terms and Conditions as part of Proposal #${proposalNumber}.
                </div>
                <div class="terms-signature-row">
                  <div class="terms-signature-block">
                    <div class="terms-signature-label">Customer Signature</div>
                    <div class="terms-signature-line"></div>
                  </div>
                  <div class="terms-signature-block">
                    <div class="terms-signature-label">Date</div>
                    <div class="terms-signature-line"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ` : `
          <!-- Customer Version - Full Footer -->
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
            <p style="margin-bottom: 10px;">${paymentText}</p>
            <p style="margin-bottom: 15px;"><strong>Note:</strong> This proposal may be withdrawn by us if not accepted within 30 days.</p>
            <div class="signature-section">
              <p style="margin-bottom: 5px;"><strong>Acceptance of Proposal</strong></p>
              <p style="margin-bottom: 20px;">${acceptanceText}</p>
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
          
          <div class="terms-page">
            <div class="terms-header">
              <div class="terms-title">Standard Terms and Conditions</div>
              <div class="terms-reference">Proposal #${proposalNumber} | ${job.name} | ${job.client_name}</div>
              <div class="terms-reference">Contract Amount: $${totals.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            </div>
            <div class="terms-content">
              <div class="terms-section">
                <div class="terms-section-title">Change Orders:</div>
                <div class="terms-section-text">Any additions or deviations from the original scope involving extra costs for labor or materials will be executed only upon a written Change Order, signed by both ${companyName} and the Customer.</div>
              </div>
              <div class="terms-section">
                <div class="terms-section-title">Site Conditions:</div>
                <div class="terms-section-text">The contract price assumes normal soil conditions. If subsurface obstructions (e.g., rock, utilities, high water) are encountered, the Customer is responsible for additional excavation costs.</div>
              </div>
              <div class="terms-section">
                <div class="terms-section-title">Permits:</div>
                <div class="terms-section-text">Unless otherwise noted, the Customer is responsible for all building permits, zoning fees, and utility hookups.</div>
              </div>
              <div class="terms-section">
                <div class="terms-section-title">Payment Schedule:</div>
                <div class="terms-section-text">${paymentText}</div>
              </div>
              <div class="terms-section">
                <div class="terms-section-title">Site Access:</div>
                <div class="terms-section-text">Customer must provide clear, unobstructed access for heavy equipment and delivery trucks to the build site.</div>
              </div>
              <div class="terms-section">
                <div class="terms-section-title">Insurance:</div>
                <div class="terms-section-text">${companyName} carries General Liability and Workers' Comp. Customer is responsible for 'Course of Construction' insurance once materials are delivered.</div>
              </div>
              <div class="terms-section">
                <div class="terms-section-title">Workmanship Warranty:</div>
                <div class="terms-section-text">${companyName} warrants workmanship for one (1) year. Manufacturer warranties apply to steel panels, doors, and hardware.</div>
              </div>
              <div class="terms-signature-section">
                <div class="terms-signature-intro">
                  By signing below, the Customer acknowledges having read, understood, and agreed to these Standard Terms and Conditions as part of Proposal #${proposalNumber}.
                </div>
                <div class="terms-signature-row">
                  <div class="terms-signature-block">
                    <div class="terms-signature-label">Customer Signature</div>
                    <div class="terms-signature-line"></div>
                  </div>
                  <div class="terms-signature-block">
                    <div class="terms-signature-label">Date</div>
                    <div class="terms-signature-line"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `}
      </body>
    </html>
  `;
}
