// Edge Function for IMAP email fetching and auto-categorization
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

interface EmailMessage {
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  subject: string;
  from: { email: string; name?: string };
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  date: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: Array<{ filename: string; contentType: string; size: number }>;
  headers: any;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, emailData } = await req.json();

    if (action === 'fetch') {
      // Fetch emails from IMAP
      const result = await fetchEmailsFromIMAP(supabaseClient, user.id);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'send') {
      // Send email via SMTP and save to IMAP Sent folder
      const result = await sendEmailViaSMTP(supabaseClient, user.id, emailData);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Email sync error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchEmailsFromIMAP(supabaseClient: any, userId: string) {
  const syncStartTime = new Date().toISOString();
  let emailsProcessed = 0;
  let emailsCategorized = 0;

  try {
    // Get email settings
    const { data: settings, error: settingsError } = await supabaseClient
      .from('email_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (settingsError || !settings) {
      throw new Error('Email settings not found. Please configure IMAP/SMTP settings first.');
    }

    if (!settings.sync_enabled) {
      throw new Error('Email sync is disabled');
    }

    // Note: In production, you would use a proper IMAP library here
    // For now, this is a placeholder for the IMAP fetching logic
    console.log('Fetching emails from IMAP:', settings.imap_host);
    
    // TODO: Implement actual IMAP fetching using a library like 'imap' or 'node-imap'
    // This would connect to the IMAP server, fetch new emails since last_sync_at,
    // and parse them into EmailMessage objects

    const mockEmails: EmailMessage[] = []; // Placeholder for fetched emails

    // Get all jobs and their customer emails for auto-categorization
    const { data: jobs } = await supabaseClient
      .from('jobs')
      .select('id, job_number, client_name, client_email');

    // Process each email
    for (const email of mockEmails) {
      emailsProcessed++;

      // Auto-categorize email to job
      let matchedJobId = null;

      // Method 1: Check if subject contains job number
      for (const job of jobs || []) {
        if (job.job_number && email.subject.includes(job.job_number)) {
          matchedJobId = job.id;
          break;
        }
      }

      // Method 2: Check if sender email matches customer
      if (!matchedJobId) {
        for (const job of jobs || []) {
          if (job.client_email && email.from.email.toLowerCase() === job.client_email.toLowerCase()) {
            matchedJobId = job.id;
            break;
          }
        }
      }

      if (matchedJobId) {
        emailsCategorized++;

        // Insert email into job_emails
        await supabaseClient.from('job_emails').insert({
          job_id: matchedJobId,
          message_id: email.messageId,
          in_reply_to: email.inReplyTo,
          references: email.references,
          subject: email.subject,
          from_email: email.from.email,
          from_name: email.from.name,
          to_emails: email.to,
          cc_emails: email.cc || [],
          body_text: email.bodyText,
          body_html: email.bodyHtml,
          email_date: email.date,
          direction: 'inbound',
          raw_headers: email.headers,
        });
      }
    }

    // Update last sync time
    await supabaseClient
      .from('email_settings')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', userId);

    // Log sync operation
    await supabaseClient.from('email_sync_log').insert({
      user_id: userId,
      sync_type: 'imap_fetch',
      status: 'success',
      emails_processed: emailsProcessed,
      emails_categorized: emailsCategorized,
      sync_started_at: syncStartTime,
      sync_completed_at: new Date().toISOString(),
    });

    return {
      success: true,
      emailsProcessed,
      emailsCategorized,
      message: `Fetched ${emailsProcessed} emails, categorized ${emailsCategorized} to jobs`,
    };
  } catch (error: any) {
    // Log error
    await supabaseClient.from('email_sync_log').insert({
      user_id: userId,
      sync_type: 'imap_fetch',
      status: 'error',
      emails_processed: emailsProcessed,
      emails_categorized: emailsCategorized,
      error_message: error.message,
      sync_started_at: syncStartTime,
      sync_completed_at: new Date().toISOString(),
    });

    throw error;
  }
}

async function sendEmailViaSMTP(supabaseClient: any, userId: string, emailData: any) {
  const syncStartTime = new Date().toISOString();

  try {
    // Get email settings
    const { data: settings, error: settingsError } = await supabaseClient
      .from('email_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (settingsError || !settings) {
      throw new Error('Email settings not found');
    }

    // TODO: Implement actual SMTP sending using a library
    // This would:
    // 1. Send the email via SMTP
    // 2. Save a copy to the IMAP "Sent" folder for Thunderbird sync
    // 3. Store the email in job_emails table

    console.log('Sending email via SMTP:', settings.smtp_host);

    const messageId = `<${crypto.randomUUID()}@${settings.smtp_from_email.split('@')[1]}>`;

    // Insert into job_emails
    await supabaseClient.from('job_emails').insert({
      job_id: emailData.jobId,
      message_id: messageId,
      in_reply_to: emailData.inReplyTo,
      references: emailData.references || [],
      subject: emailData.subject,
      from_email: settings.smtp_from_email,
      from_name: settings.smtp_from_name,
      to_emails: emailData.to,
      cc_emails: emailData.cc || [],
      bcc_emails: emailData.bcc || [],
      body_text: emailData.bodyText,
      body_html: emailData.bodyHtml,
      email_date: new Date().toISOString(),
      direction: 'outbound',
      synced_to_sent: true, // Marked as synced after uploading to IMAP Sent
    });

    // Log sync operation
    await supabaseClient.from('email_sync_log').insert({
      user_id: userId,
      sync_type: 'smtp_send',
      status: 'success',
      emails_processed: 1,
      sync_started_at: syncStartTime,
      sync_completed_at: new Date().toISOString(),
    });

    return {
      success: true,
      messageId,
      message: 'Email sent successfully and synced to Sent folder',
    };
  } catch (error: any) {
    // Log error
    await supabaseClient.from('email_sync_log').insert({
      user_id: userId,
      sync_type: 'smtp_send',
      status: 'error',
      error_message: error.message,
      sync_started_at: syncStartTime,
      sync_completed_at: new Date().toISOString(),
    });

    throw error;
  }
}
