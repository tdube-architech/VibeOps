import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.RENDERER_VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.RENDERER_VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured. Set RENDERER_VITE_SUPABASE_URL and RENDERER_VITE_SUPABASE_ANON_KEY in .env.');
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // Electron renderer is sandboxed; persistSession in localStorage is fine for runtime
        // but the canonical cross-window store lives in main-process safeStorage via IPC.
        persistSession: true,
        storageKey: 'vibeops-supabase-auth',
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce'
      }
    });
  }
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
