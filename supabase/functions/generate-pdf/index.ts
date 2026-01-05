import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

function generatePayrollHTML(data: any): string {
  const { title, users } = data;
  
  return `
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #1a1a1a;
        line-height: 1.5;
      }
      
      .header {
        text-align: center;
        margin-bottom: 30px;
        padding-bottom: 15px;
        border-bottom: 3px solid #2d5f3f;
      }
      
      .header h1 {
        color: #2d5f3f;
        font-size: 28px;
        margin-bottom: 5px;
      }
      
      .header .subtitle {
        color: #666;
        font-size: 14px;
      }
      
      .user-section {
        margin-bottom: 40px;
        page-break-inside: avoid;
      }
      
      .user-header {
        background: #f8f9fa;
        padding: 12px 15px;
        border-left: 4px solid #2d5f3f;
        margin-bottom: 15px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .user-name {
        font-size: 20px;
        font-weight: bold;
        color: #1a1a1a;
      }
      
      .user-total {
        font-size: 24px;
        font-weight: bold;
        color: #2d5f3f;
      }
      
      .job-card {
        margin-bottom: 20px;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        overflow: hidden;
      }
      
      .job-header {
        background: #fafafa;
        padding: 10px 15px;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .job-name {
        font-weight: 600;
        font-size: 16px;
      }
      
      .job-client {
        font-size: 13px;
        color: #666;
        margin-top: 2px;
      }
      
      .job-hours {
        font-weight: bold;
        font-size: 18px;
        color: #2d5f3f;
      }
      
      .entries-table {
        width: 100%;
        border-collapse: collapse;
      }
      
      .entries-table th {
        background: #f0f0f0;
        padding: 8px 12px;
        text-align: left;
        font-size: 12px;
        font-weight: 600;
        color: #555;
        border-bottom: 2px solid #ddd;
      }
      
      .entries-table td {
        padding: 8px 12px;
        font-size: 13px;
        border-bottom: 1px solid #f0f0f0;
      }
      
      .entries-table tr:last-child td {
        border-bottom: none;
      }
      
      .entries-table tr:hover {
        background: #fafafa;
      }
      
      .type-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
      }
      
      .type-timer {
        background: #e8f5e9;
        color: #2e7d32;
      }
      
      .type-manual {
        background: #fff3e0;
        color: #e65100;
      }
      
      .hours-cell {
        font-weight: bold;
        color: #2d5f3f;
      }
      
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .user-section {
          page-break-inside: avoid;
        }
        
        .job-card {
          page-break-inside: avoid;
        }
      }
    </style>
    
    <div class="header">
      <h1>${title}</h1>
      <p class="subtitle">Time & Payroll Report</p>
    </div>
    
    ${users.map((user: any) => `
      <div class="user-section">
        <div class="user-header">
          <div class="user-name">${user.name}</div>
          <div class="user-total">${user.totalHours.toFixed(2)}h</div>
        </div>
        
        ${user.jobs.map((job: any) => `
          <div class="job-card">
            <div class="job-header">
              <div>
                <div class="job-name">${job.name}</div>
                ${job.client ? `<div class="job-client">${job.client}</div>` : ''}
              </div>
              <div class="job-hours">${job.totalHours.toFixed(2)}h</div>
            </div>
            
            <table class="entries-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Hours</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                ${job.entries.map((entry: any) => `
                  <tr>
                    <td>${entry.date}</td>
                    <td>${entry.startTime}</td>
                    <td>${entry.endTime}</td>
                    <td class="hours-cell">${entry.hours}h</td>
                    <td>
                      <span class="type-badge ${entry.type === 'Timer' ? 'type-timer' : 'type-manual'}">
                        ${entry.type}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `).join('')}
      </div>
    `).join('')}
  `;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { html, filename, type, data } = body;

    // If type is payroll, generate HTML from data
    let finalHtml = html;
    let finalFilename = filename || 'report.pdf';

    if (type === 'payroll' && data) {
      console.log('📊 Generating payroll PDF from structured data');
      finalHtml = generatePayrollHTML(data);
      finalFilename = data.title.replace(/[^a-zA-Z0-9-_\s]/g, '').replace(/\s+/g, '_') + '.pdf';
    } else if (!finalHtml) {
      return new Response(
        JSON.stringify({ error: 'HTML content or data is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('📄 PDF generation requested for:', finalFilename);
    console.log('📊 HTML length:', finalHtml?.length || 0);

    // Return HTML optimized for browser's native Print to PDF
    // This is the most reliable cross-platform solution
    const printOptimizedHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${finalFilename}</title>
          <style>
            @media print {
              @page {
                margin: 1.5cm;
                size: letter;
              }
            }
            body {
              margin: 0;
              padding: 20px;
            }
            .print-instructions {
              background: #f0f7f0;
              border: 2px solid #2d5f3f;
              border-radius: 8px;
              padding: 20px;
              margin-bottom: 30px;
              text-align: center;
            }
            .print-instructions h2 {
              color: #2d5f3f;
              margin: 0 0 10px 0;
            }
            .print-instructions p {
              margin: 5px 0;
              color: #333;
            }
            .print-instructions button {
              background: #2d5f3f;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 6px;
              font-size: 16px;
              font-weight: bold;
              cursor: pointer;
              margin-top: 15px;
            }
            .print-instructions button:hover {
              background: #1a3d28;
            }
            @media print {
              .print-instructions {
                display: none;
              }
            }
          </style>
          <script>
            function printPDF() {
              window.print();
            }
            
            // Auto-trigger print dialog after page loads
            window.addEventListener('load', function() {
              // Small delay to ensure page is fully rendered
              setTimeout(function() {
                window.print();
              }, 500);
            });
          </script>
        </head>
        <body>
          <div class="print-instructions">
            <h2>🖨️ Save as PDF</h2>
            <p><strong>The print dialog will open automatically.</strong></p>
            <p>In the print dialog, select "Save as PDF" or "Microsoft Print to PDF" as your printer.</p>
            <p>If it didn't open automatically, click the button below:</p>
            <button onclick="printPDF()">Open Print Dialog</button>
          </div>
          ${finalHtml}
        </body>
      </html>
    `;

    console.log('✅ Print-optimized HTML prepared');

    return new Response(printOptimizedHtml, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
      },
    });

  } catch (error: any) {
    console.error('❌ Error preparing PDF:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to prepare PDF', details: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
