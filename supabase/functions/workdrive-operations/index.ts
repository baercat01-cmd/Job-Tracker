import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

const ZOHO_TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token';
const WORKDRIVE_API_BASE = 'https://workdrive.zoho.com/api/v1';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, jobId, jobName, fileName, fileData, fileType } = await req.json();

    // Get Zoho credentials from settings
    const { data: settings, error: settingsError } = await supabaseClient
      .from('zoho_integration_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (settingsError || !settings) {
      throw new Error('Zoho integration not configured');
    }

    // Refresh access token
    const accessToken = await refreshAccessToken(settings);

    if (action === 'create_job_folders') {
      // Create parent folder for the job
      const parentFolder = await createFolder(accessToken, jobName, null);
      
      if (!parentFolder?.data?.id) {
        throw new Error('Failed to create parent folder');
      }

      const parentFolderId = parentFolder.data.id;

      // Create subfolders
      const subfolders = ['Estimates', 'Site Photos', 'Documents'];
      const subfolderIds: Record<string, string> = {};

      for (const subfolderName of subfolders) {
        const subfolder = await createFolder(accessToken, subfolderName, parentFolderId);
        if (subfolder?.data?.id) {
          subfolderIds[subfolderName] = subfolder.data.id;
        }
      }

      // Update job with folder IDs
      const { error: updateError } = await supabaseClient
        .from('jobs')
        .update({
          workdrive_folder_id: parentFolderId,
        })
        .eq('id', jobId);

      if (updateError) {
        console.error('Error updating job with folder ID:', updateError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          parentFolderId,
          subfolderIds,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'upload_file') {
      // Get job to find folder structure
      const { data: job, error: jobError } = await supabaseClient
        .from('jobs')
        .select('workdrive_folder_id')
        .eq('id', jobId)
        .single();

      if (jobError || !job?.workdrive_folder_id) {
        throw new Error('Job folder not found');
      }

      // Get the Site Photos subfolder
      const subfolders = await listFolders(accessToken, job.workdrive_folder_id);
      const sitePhotosFolder = subfolders.find((f: any) => f.attributes.name === 'Site Photos');

      if (!sitePhotosFolder) {
        throw new Error('Site Photos folder not found');
      }

      // Upload file to Site Photos folder
      const uploadResult = await uploadFile(
        accessToken,
        sitePhotosFolder.id,
        fileName,
        fileData,
        fileType
      );

      return new Response(
        JSON.stringify({
          success: true,
          file: uploadResult,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');
  } catch (error: any) {
    console.error('WorkDrive operation error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function refreshAccessToken(settings: any): Promise<string> {
  // Check if current token is still valid
  if (settings.access_token && settings.token_expires_at) {
    const expiresAt = new Date(settings.token_expires_at);
    const now = new Date();
    const bufferMinutes = 5;
    
    if (expiresAt.getTime() - now.getTime() > bufferMinutes * 60 * 1000) {
      return settings.access_token;
    }
  }

  // Refresh token
  const params = new URLSearchParams({
    refresh_token: settings.refresh_token,
    client_id: settings.client_id,
    client_secret: settings.client_secret,
    grant_type: 'refresh_token',
  });

  const response = await fetch(ZOHO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh Zoho access token');
  }

  const data = await response.json();

  // Update stored token
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + data.expires_in);

  await supabaseClient
    .from('zoho_integration_settings')
    .update({
      access_token: data.access_token,
      token_expires_at: expiresAt.toISOString(),
    })
    .eq('id', settings.id);

  return data.access_token;
}

async function createFolder(
  accessToken: string,
  folderName: string,
  parentId: string | null
): Promise<any> {
  const body: any = {
    data: {
      attributes: {
        name: folderName,
        parent_id: parentId,
      },
      type: 'files',
    },
  };

  const response = await fetch(`${WORKDRIVE_API_BASE}/files`, {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Zoho WorkDrive create folder error:', error);
    throw new Error(`Failed to create folder: ${error}`);
  }

  return await response.json();
}

async function listFolders(accessToken: string, parentId: string): Promise<any[]> {
  const response = await fetch(
    `${WORKDRIVE_API_BASE}/files/${parentId}/files`,
    {
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to list folders');
  }

  const data = await response.json();
  return data.data || [];
}

async function uploadFile(
  accessToken: string,
  folderId: string,
  fileName: string,
  fileData: string,
  fileType: string
): Promise<any> {
  // Convert base64 to blob
  const base64Data = fileData.split(',')[1] || fileData;
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: fileType });

  // Create form data
  const formData = new FormData();
  formData.append('content', blob, fileName);
  formData.append('parent_id', folderId);
  formData.append('override-name-exist', 'true');

  const response = await fetch(`${WORKDRIVE_API_BASE}/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Zoho WorkDrive upload error:', error);
    throw new Error(`Failed to upload file: ${error}`);
  }

  return await response.json();
}
