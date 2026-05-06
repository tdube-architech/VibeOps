import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getSupabase } from '@/lib/supabase';
import type { AuthState } from '@shared/types';

export function useAuth() {
  const [state, setState] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await api.auth.getSession();
        const nowSec = Math.floor(Date.now() / 1000);
        const isExpired = stored?.expires_at !== null && stored?.expires_at !== undefined
          && stored.expires_at <= nowSec - 30;

        if (stored && isExpired) {
          console.warn('[auth] stored access_token expired; signing out');
          await api.auth.signOut();
          try { await getSupabase().auth.signOut(); } catch { /* ignore */ }
          if (mounted) setState({ status: 'unauthenticated', user: null });
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
            if (mounted) setState({ status: 'unauthenticated', user: null });
            return;
          }
        }
        const s = await api.auth.getState();
        if (mounted) setState(s);
      } catch (e) {
        console.warn('[auth] restore failed', e);
        if (mounted) setState({ status: 'unauthenticated', user: null });
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const supabase = getSupabase();
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.info('[auth] supabase event', event);
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
        if (mounted) setState({ status: 'unauthenticated', user: null });
      }
    });

    const off = api.auth.onState((s) => setState(s));
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      off();
    };
  }, []);

  return { state, loading };
}

export async function signInWithGitHub(): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: 'vibeops://auth/callback',
      skipBrowserRedirect: true
    }
  });
  if (error || !data?.url) return { error: error?.message ?? 'No OAuth URL returned' };
  await api.auth.openExternal(data.url);
  return { error: null };
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
