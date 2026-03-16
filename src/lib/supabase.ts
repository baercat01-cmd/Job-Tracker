import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const MISSING_ENV_MSG =
  'Missing Supabase config. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file and restart the dev server.';

const LOCALHOST_ERROR_MSG =
  'ERROR: Supabase URL is set to localhost in production. Please set VITE_SUPABASE_URL to your actual Supabase project URL (e.g., https://yourproject.supabase.co) in your deployment environment variables.';

// Validate configuration on module load
if (supabaseUrl) {
  const isLocalhost = supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1');
  const isProduction = import.meta.env.PROD;
  
  if (isLocalhost && isProduction) {
    console.error(
      `\n⚠️  CRITICAL CONFIGURATION ERROR ⚠️\n\n` +
      `VITE_SUPABASE_URL is set to: ${supabaseUrl}\n` +
      `This will not work in production!\n\n` +
      `Expected format: https://<project-ref>.supabase.co\n` +
      `or https://<project-id>.backend.onspace.ai\n\n` +
      `Please check your deployment environment variables.\n`
    );
    throw new Error(LOCALHOST_ERROR_MSG);
  }
  
  // Log configuration in development for debugging
  if (!isProduction) {
    console.log('Supabase URL:', supabaseUrl);
  }
}

function getClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(MISSING_ENV_MSG);
  }
  return clientInstance!;
}

let clientInstance: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: 'fieldtrack-auth',
          storage: window.localStorage,
        },
      })
    : null;

// Expose client; throw only when first used so the app can mount and show an error UI
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getClient() as any)[prop];
  },
});
