import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

// Simple IMAP client implementation for Deno
class ImapClient {
  private conn: Deno.Conn | null = null;
  private host: string;
  private port: number;
  private username: string;
  private password: string;

  constructor(host: string, port: number, username: string, password: string) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
  }

  async connect() {
    console.log(`Connecting to IMAP server ${this.host}:${this.port}...`);
    
    // Connect with TLS
    this.conn = await Deno.connectTls({
      hostname: this.host,
      port: this.port,
    });

    await this.readResponse(); // Read greeting
    
    // Login
    await this.sendCommand(`LOGIN "${this.username}" "${this.password}"`);
    console.log('IMAP login successful');
  }

  async sendCommand(command: string) {
    if (!this.conn) throw new Error('Not connected');
    
    const encoder = new TextEncoder();
    const tag = `A${Date.now()}`;
    const fullCommand = `${tag} ${command}\r\n`;
    
    console.log('IMAP →', fullCommand.trim());
    await this.conn.write(encoder.encode(fullCommand));
    
    const response = await this.readResponse();
    
    if (!response.includes(`${tag} OK`)) {
      throw new Error(`IMAP command failed: ${response}`);
    }
    
    return response;
  }

  async readResponse(): Promise<string> {
    if (!this.conn) throw new Error('Not connected');
    
    const decoder = new TextDecoder();
    const buffer = new Uint8Array(65536);
    let response = '';
    
    while (true) {
      const bytesRead = await this.conn.read(buffer);
      if (!bytesRead) break;
      
      response += decoder.decode(buffer.subarray(0, bytesRead));
      
      // Check if we have a complete response
      if (response.includes('\r\n')) {
        console.log('IMAP ←', response.trim().substring(0, 200));
        break;
      }
    }
    
    return response;
  }

  async selectMailbox(mailbox: string) {
    return await this.sendCommand(`SELECT "${mailbox}"`);
  }

  async searchEmails(criteria: string = 'ALL') {
    const response = await this.sendCommand(`SEARCH ${criteria}`);
    
    // Parse message IDs from response
    const matches = response.match(/\* SEARCH (.+)\r\n/);
    if (!matches) return [];
    
    return matches[1].split(' ').filter(id => id.trim());
  }

  async fetchEmail(messageId: string) {
    const response = await this.sendCommand(
      `FETCH ${messageId} (FLAGS INTERNALDATE BODY.PEEK[HEADER] BODY.PEEK[TEXT])`
    );
    
    return this.parseEmailResponse(response);
  }

  parseEmailResponse(response: string) {
    const headers: any = {};
    const headerMatch = response.match(/BODY\[HEADER\] \{(\d+)\}\r\n([\s\S]+?)\r\n\)/);
    
    if (headerMatch) {
      const headerText = headerMatch[2];
      const lines = headerText.split('\r\n');
      
      let currentHeader = '';
      for (const line of lines) {
        if (line.match(/^[\w-]+:/)) {
          const [key, ...valueParts] = line.split(':');
          currentHeader = key.trim().toLowerCase();
          headers[currentHeader] = valueParts.join(':').trim();
        } else if (currentHeader && line.startsWith(' ') || line.startsWith('\t')) {
          headers[currentHeader] += ' ' + line.trim();
        }
      }
    }

    const bodyMatch = response.match(/BODY\[TEXT\] \{(\d+)\}\r\n([\s\S]+?)(?=\r\n\))/);
    const body = bodyMatch ? bodyMatch[2] : '';

    return {
      messageId: headers['message-id'] || '',
      subject: headers['subject'] || '(No Subject)',
      from: headers['from'] || '',
      to: headers['to'] || '',
      cc: headers['cc'] || '',
      date: headers['date'] || '',
      body,
      headers,
    };
  }

  async appendToSent(emailData: string) {
    // Append to Sent folder
    const size = new TextEncoder().encode(emailData).length;
    return await this.sendCommand(`APPEND "Sent" {${size}}\r\n${emailData}`);
  }

  async close() {
    if (this.conn) {
      try {
        await this.sendCommand('LOGOUT');
      } catch (e) {
        console.error('Error during logout:', e);
      }
      this.conn.close();
      this.conn = null;
    }
  }
}

// Simple SMTP client implementation
class SmtpClient {
  private conn: Deno.Conn | null = null;
  private host: string;
  private port: number;
  private username: string;
  private password: string;

  constructor(host: string, port: number, username: string, password: string) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
  }

  async connect() {
    console.log(`Connecting to SMTP server ${this.host}:${this.port}...`);
    
    // Connect with TLS for port 465, or plain for 587 (will STARTTLS)
    if (this.port === 465) {
      this.conn = await Deno.connectTls({
        hostname: this.host,
        port: this.port,
      });
    } else {
      const plainConn = await Deno.connect({
        hostname: this.host,
        port: this.port,
      });
      
      await this.readResponse(plainConn); // Read greeting
      await this.sendCommand(plainConn, 'STARTTLS');
      
      // Upgrade to TLS
      this.conn = await Deno.startTls(plainConn, { hostname: this.host });
    }

    await this.readResponse(); // Read greeting after TLS
    
    // EHLO
    await this.sendCommand(`EHLO ${this.host}`);
    
    // AUTH LOGIN
    await this.sendCommand('AUTH LOGIN');
    await this.sendCommand(btoa(this.username));
    await this.sendCommand(btoa(this.password));
    
    console.log('SMTP login successful');
  }

  async sendCommand(command: string, conn?: Deno.Conn) {
    const connection = conn || this.conn;
    if (!connection) throw new Error('Not connected');
    
    const encoder = new TextEncoder();
    const fullCommand = `${command}\r\n`;
    
    console.log('SMTP →', command);
    await connection.write(encoder.encode(fullCommand));
    
    return await this.readResponse(connection);
  }

  async readResponse(conn?: Deno.Conn): Promise<string> {
    const connection = conn || this.conn;
    if (!connection) throw new Error('Not connected');
    
    const decoder = new TextDecoder();
    const buffer = new Uint8Array(4096);
    let response = '';
    
    const bytesRead = await connection.read(buffer);
    if (bytesRead) {
      response = decoder.decode(buffer.subarray(0, bytesRead));
      console.log('SMTP ←', response.trim());
    }
    
    return response;
  }

  async sendEmail(from: string, to: string[], subject: string, body: string, cc?: string[], bcc?: string[]) {
    // MAIL FROM
    await this.sendCommand(`MAIL FROM:<${from}>`);
    
    // RCPT TO
    const allRecipients = [...to, ...(cc || []), ...(bcc || [])];
    for (const recipient of allRecipients) {
      await this.sendCommand(`RCPT TO:<${recipient}>`);
    }
    
    // DATA
    await this.sendCommand('DATA');
    
    // Email headers and body
    const encoder = new TextEncoder();
    const date = new Date().toUTCString();
    const messageId = `<${Date.now()}.${Math.random().toString(36)}@${this.host}>`;
    
    let emailData = '';
    emailData += `From: ${from}\r\n`;
    emailData += `To: ${to.join(', ')}\r\n`;
    if (cc && cc.length > 0) emailData += `Cc: ${cc.join(', ')}\r\n`;
    emailData += `Subject: ${subject}\r\n`;
    emailData += `Date: ${date}\r\n`;
    emailData += `Message-ID: ${messageId}\r\n`;
    emailData += `Content-Type: text/plain; charset=utf-8\r\n`;
    emailData += `\r\n`;
    emailData += body;
    emailData += `\r\n.\r\n`;
    
    if (this.conn) {
      await this.conn.write(encoder.encode(emailData));
      await this.readResponse();
    }
    
    console.log('Email sent successfully');
    return { messageId, emailData };
  }

  async close() {
    if (this.conn) {
      try {
        await this.sendCommand('QUIT');
      } catch (e) {
        console.error('Error during SMTP quit:', e);
      }
      this.conn.close();
      this.conn = null;
    }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, emailData } = await req.json();
    
    console.log('Email sync action:', action);

    // Get email settings from database
    const { data: settings, error: settingsError } = await supabase
      .from('email_settings')
      .select('*')
      .eq('sync_enabled', true)
      .maybeSingle();

    if (settingsError) {
      throw new Error(`Failed to load email settings: ${settingsError.message}`);
    }

    if (!settings) {
      return new Response(
        JSON.stringify({ 
          error: 'No email settings configured. Please configure IMAP/SMTP settings first.' 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (action === 'fetch') {
      // Fetch emails from IMAP
      const imap = new ImapClient(
        settings.imap_host,
        settings.imap_port,
        settings.imap_username,
        settings.imap_password
      );

      try {
        await imap.connect();
        await imap.selectMailbox('INBOX');
        
        // Search for recent emails (last 30 days)
        const messageIds = await imap.searchEmails('SINCE 1-Jan-2025');
        
        console.log(`Found ${messageIds.length} emails to process`);
        
        let processedCount = 0;
        let categorizedCount = 0;

        // Fetch and store emails
        for (const msgId of messageIds.slice(0, 50)) { // Limit to 50 emails per sync
          try {
            const email = await imap.fetchEmail(msgId);
            
            // Check if email already exists
            const { data: existing } = await supabase
              .from('job_emails')
              .select('id')
              .eq('message_id', email.messageId)
              .maybeSingle();

            if (existing) {
              console.log(`Email ${email.messageId} already exists, skipping`);
              continue;
            }

            // Smart categorization
            let jobId = null;
            let contactId = null;
            let entityCategory = null;

            // 1. Try to find job by job number in subject (#1024)
            const jobNumberMatch = email.subject.match(/#(\d+)/);
            if (jobNumberMatch) {
              const jobNumber = jobNumberMatch[1];
              const { data: job } = await supabase
                .from('jobs')
                .select('id')
                .eq('job_number', jobNumber)
                .maybeSingle();
              
              if (job) {
                jobId = job.id;
                console.log(`Matched to job #${jobNumber}`);
              }
            }

            // 2. Try to match sender email to contact
            const fromEmail = email.from.match(/<(.+?)>/)?.[1] || email.from;
            const { data: contact } = await supabase
              .from('contacts')
              .select('id, category, job_id')
              .eq('email', fromEmail)
              .maybeSingle();

            if (contact) {
              contactId = contact.id;
              entityCategory = contact.category.toLowerCase();
              if (!jobId && contact.job_id) {
                jobId = contact.job_id;
              }
              console.log(`Matched to contact (${entityCategory})`);
            }

            // If we have a job match, store the email
            if (jobId) {
              const { error: insertError } = await supabase
                .from('job_emails')
                .insert({
                  job_id: jobId,
                  contact_id: contactId,
                  entity_category: entityCategory,
                  message_id: email.messageId,
                  subject: email.subject,
                  from_email: fromEmail,
                  from_name: email.from,
                  to_emails: [email.to],
                  cc_emails: email.cc ? [email.cc] : [],
                  body_text: email.body,
                  email_date: new Date(email.date).toISOString(),
                  direction: 'received',
                  is_read: false,
                  raw_headers: email.headers,
                });

              if (!insertError) {
                categorizedCount++;
                console.log(`Email categorized and stored`);
              }
            }

            processedCount++;
          } catch (emailError) {
            console.error(`Error processing email ${msgId}:`, emailError);
          }
        }

        await imap.close();

        // Update last sync time
        await supabase
          .from('email_settings')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', settings.id);

        return new Response(
          JSON.stringify({
            success: true,
            message: `Synced ${processedCount} emails, categorized ${categorizedCount} to jobs`,
            processed: processedCount,
            categorized: categorizedCount,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } finally {
        await imap.close();
      }

    } else if (action === 'send') {
      // Send email via SMTP and sync to Sent folder
      const { from, to, cc, bcc, subject, body } = emailData;

      const smtp = new SmtpClient(
        settings.smtp_host,
        settings.smtp_port,
        settings.smtp_username,
        settings.smtp_password
      );

      const imap = new ImapClient(
        settings.imap_host,
        settings.imap_port,
        settings.imap_username,
        settings.imap_password
      );

      try {
        // Send via SMTP
        await smtp.connect();
        const { messageId, emailData: rawEmail } = await smtp.sendEmail(
          from || settings.smtp_from_email,
          Array.isArray(to) ? to : [to],
          subject,
          body,
          cc,
          bcc
        );
        await smtp.close();

        // Sync to IMAP Sent folder
        await imap.connect();
        await imap.appendToSent(rawEmail);
        await imap.close();

        console.log('Email sent and synced to Sent folder');

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Email sent and synced to Thunderbird',
            messageId,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } finally {
        await smtp.close();
        await imap.close();
      }

    } else {
      throw new Error(`Unknown action: ${action}`);
    }

  } catch (error: any) {
    console.error('Email sync error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Email sync failed',
        details: error.toString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
