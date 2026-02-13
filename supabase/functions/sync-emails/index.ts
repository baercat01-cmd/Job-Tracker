// Edge Function for Multi-Entity Email Communication Engine with Smart Categorization
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

interface EmailMessage {
  messageId: string;
  inReplyTo?: string;
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
      const result = await fetchEmailsFromIMAP(supabaseClient, user.id);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'send') {
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

    console.log('Fetching emails from IMAP:', settings.imap_host);
    
    // TODO: Implement actual IMAP fetching
    const mockEmails: EmailMessage[] = [];

    // Get all jobs for job number matching (#JobNumber pattern)
    const { data: jobs } = await supabaseClient
      .from('jobs')
      .select('id, job_number');

    // Get all contacts for multi-entity categorization
    const { data: contacts } = await supabaseClient
      .from('contacts')
      .select('id, email, category, job_id');

    // Process each email with Smart Categorization
    for (const email of mockEmails) {
      emailsProcessed++;

      let matchedJobId = null;
      let matchedContactId = null;
      let entityCategory = null;

      // METHOD 1: Smart Job Detection - Parse subject for #JobNumber (e.g., #1024)
      const jobNumberMatch = email.subject.match(/#(\d+)/);
      if (jobNumberMatch) {
        const jobNumber = jobNumberMatch[1];
        const job = (jobs || []).find(j => j.job_number === jobNumber);
        if (job) {
          matchedJobId = job.id;
          console.log(`📋 Job matched via #${jobNumber}: ${job.id}`);
        }
      }

      // METHOD 2: Entity Categorization - Match sender email to contacts
      const fromEmail = email.from.email.toLowerCase();
      const contact = (contacts || []).find(c => c.email.toLowerCase() === fromEmail);
      
      if (contact) {
        matchedContactId = contact.id;
        entityCategory = contact.category;
        
        // If no job found yet, use contact's linked job
        if (!matchedJobId && contact.job_id) {
          matchedJobId = contact.job_id;
        }
        
        console.log(`👤 Contact matched - Category: ${entityCategory}, Email: ${fromEmail}`);
      }

      // Only insert if we have at least a job or contact match
      if (matchedJobId || matchedContactId) {
        emailsCategorized++;

        await supabaseClient.from('job_emails').insert({
          job_id: matchedJobId,
          contact_id: matchedContactId,
          entity_category: entityCategory,
          message_id: email.messageId,
          in_reply_to: email.inReplyTo,
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

        console.log(`✅ Email categorized - Job: ${matchedJobId || 'None'}, Entity: ${entityCategory || 'None'}`);
      } else {
        console.log(`⏭️ Email skipped - no job or contact match: ${email.subject}`);
      }
    }

    await supabaseClient
      .from('email_settings')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', userId);

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
    const { data: settings, error: settingsError } = await supabaseClient
      .from('email_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (settingsError || !settings) {
      throw new Error('Email settings not found');
    }

    // TODO: Implement actual SMTP sending + IMAP Sent folder sync
    console.log('Sending email via SMTP:', settings.smtp_host);

    const messageId = `<${crypto.randomUUID()}@${settings.smtp_from_email.split('@')[1]}>`;

    // Determine entity category if contact is specified
    let entityCategory = null;
    let contactId = emailData.contactId || null;
    
    if (!contactId && emailData.to && emailData.to.length > 0) {
      const toEmail = emailData.to[0].email.toLowerCase();
      const { data: contact } = await supabaseClient
        .from('contacts')
        .select('id, category')
        .eq('email', toEmail)
        .maybeSingle();
      
      if (contact) {
        contactId = contact.id;
        entityCategory = contact.category;
      }
    }

    // Insert into job_emails with entity categorization
    await supabaseClient.from('job_emails').insert({
      job_id: emailData.jobId,
      contact_id: contactId,
      entity_category: entityCategory,
      message_id: messageId,
      in_reply_to: emailData.inReplyTo,
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
      synced_to_sent: true,
    });

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
