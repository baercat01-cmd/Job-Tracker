import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Configure Supabase client with persistent session storage
// Sessions are stored in localStorage and automatically restored on app restart
// Users stay signed in permanently until they manually log out
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Enable persistent sessions (already enabled)
    autoRefreshToken: true, // Automatically refresh expired tokens
    detectSessionInUrl: false, // Don't detect sessions from URL for better security
    storageKey: 'fieldtrack-auth', // Custom storage key for session
    storage: window.localStorage, // Use localStorage for persistent storage
  },
});
