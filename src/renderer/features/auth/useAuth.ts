import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getSupabase } from '@/lib/supabase';
import type { AuthState } from '@shared/types';

// Single shared subscription for all useAuth() consumers. Each component
// previously registered its own ipcRenderer.on('auth:state', …) which trips
// Node's default 10-listener cap once half a dozen cards are mounted.
const stateListeners = new Set<(s: AuthState | null) => void>();
let lastState: AuthState | null = null;
let storeBootstrapped = false;
let ipcSubscribed = false;

function notify(s: AuthState | null): void {
  lastState = s;
  for (const cb of stateListeners) {
    try { cb(s); } catch { /* ignore */ }
  }
}

function ensureIpcSubscribed(): void {
  if (ipcSubscribed) return;
  ipcSubscribed = true;
  api.auth.onState((s) => notify(s));
}

async function bootstrapStore(): Promise<void> {
  if (storeBootstrapped) return;
  storeBootstrapped = true;
  try {
    const stored = await api.auth.getSession();
    const nowSec = Math.floor(Date.now() / 1000);
    const isExpired = stored?.expires_at !== null && stored?.expires_at !== undefined
      && stored.expires_at <= nowSec - 30;
    if (stored && isExpired) {
      console.warn('[auth] stored access_token expired; signing out');
      await api.auth.signOut();
      try { await getSupabase().auth.signOut(); } catch { /* ignore */ }
      notify({ status: 'unauthenticated', user: null });
      return;
    }
    if (stored) {
      const { error } = await getSupabase().auth.setSession({
        access_token: stored.access_token,
        refresh_token: stored.refresh_token
      });
      if (error) {
        console.warn('[auth] stored session invalid; clearing', error.message);
        await api.auth.signOut();
        try { await getSupabase().auth.signOut(); } catch { /* ignore */ }
        notify({ status: 'unauthenticated', user: null });
        return;
      }
    }
    const s = await api.auth.getState();
    notify(s);
  } catch (e) {
    console.warn('[auth] restore failed', e);
    notify({ status: 'unauthenticated', user: null });
  }
}

// Single supabase.auth listener (not per-component). Only handles things
// that need to mutate stored state — token refresh + sign-out. The
// AuthGate runs its own one-shot effects keyed on auth status.
let supabaseSubscribed = false;
function ensureSupabaseSubscribed(): void {
  if (supabaseSubscribed) return;
  supabaseSubscribed = true;
  const supabase = getSupabase();
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'TOKEN_REFRESHED' && session) {
      await api.auth.saveSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at ?? null,
        user_id: session.user.id,
        email: session.user.email ?? null
      }).catch(() => undefined);
    }
    if (event === 'SIGNED_OUT') {
      await api.auth.signOut().catch(() => undefined);
      notify({ status: 'unauthenticated', user: null });
    }
  });
}

export function useAuth() {
  const [state, setState] = useState<AuthState | null>(lastState);
  const [loading, setLoading] = useState(lastState === null);

  useEffect(() => {
    ensureIpcSubscribed();
    ensureSupabaseSubscribed();
    const cb = (s: AuthState | null): void => {
      setState(s);
      setLoading(false);
    };
    stateListeners.add(cb);
    void bootstrapStore().finally(() => setLoading(false));
    return () => { stateListeners.delete(cb); };
  }, []);

  return { state, loading };
}

const GITHUB_SCOPES = 'repo read:user read:org user:email';

export async function signInWithGitHub(): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: 'vibeops://auth/callback',
      scopes: GITHUB_SCOPES,
      skipBrowserRedirect: true
    }
  });
  if (error || !data?.url) return { error: error?.message ?? 'No OAuth URL returned' };
  await api.auth.openExternal(data.url);
  return { error: null };
}

export async function reconnectGitHub(): Promise<{ error: string | null }> {
  return signInWithGitHub();
}

export async function signInWithMagicLink(email: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: 'vibeops://auth/callback' }
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  await supabase.auth.signOut().catch(() => undefined);
  await api.auth.signOut();
}

export async function exchangeCodeForSession(code: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return { error: error.message };
  if (!data.session) return { error: 'No session returned' };
  await api.auth.saveSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at ?? null,
    user_id: data.user!.id,
    email: data.user!.email ?? null
  });
  return { error: null };
}
