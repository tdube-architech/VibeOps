import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { getSupabase } from '@/lib/supabase';
import { useAuth, exchangeCodeForSession } from './useAuth';
import { SignInScreen } from './SignInScreen';
import { endAllMyActiveSessions } from '@/lib/data/aiSessions';
import { listProjects } from '@/lib/data/projects';
import {
  grantRepoAccess, getMyGitHubCredentials, syncGitHubCredentialsFromSession
} from '@/lib/data/githubIntegration';

const PENDING_INVITE_KEY = 'vibeops:pending-invite-token';

async function acceptPendingInvite(token: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('accept_invitation', { invite_token: token });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { state, loading } = useAuth();
  const qc = useQueryClient();
  const acceptedRef = useRef<Set<string>>(new Set());
  const cleanedSessionsRef = useRef(false);

  useEffect(() => {
    if (state?.status !== 'authenticated' || cleanedSessionsRef.current) return;
    cleanedSessionsRef.current = true;
    void endAllMyActiveSessions().then((n) => {
      if (n > 0) {
        console.info(`[ai-session] cleaned ${n} orphan(s) from prior runs`);
        qc.invalidateQueries({ queryKey: ['ai-sessions'] });
      }
    });
    // First-pass capture of GitHub creds for users whose session restored
    // from cache. The deep-link handler covers the fresh-OAuth case.
    void syncGitHubCredentialsFromSession().then(() => {
      qc.invalidateQueries({ queryKey: ['github'] });
    });
  }, [state?.status, qc]);


  useEffect(() => {
    return api.auth.onDeepLink(async (rawUrl) => {
      console.info('[auth] deep link received:', rawUrl);
      try {
        const u = new URL(rawUrl);
        const path = u.pathname.replace(/^\/+/, '');

        if (u.host === 'auth' && path === 'callback') {
          const code = u.searchParams.get('code');
          if (!code) {
            const errParam = u.searchParams.get('error_description') ?? u.searchParams.get('error');
            console.error('[auth] callback missing code', errParam);
            toast.error('Sign-in failed', errParam ?? 'Provider returned no code');
            return;
          }
          console.info('[auth] exchanging code…');
          const { error } = await exchangeCodeForSession(code);
          if (error) {
            console.error('[auth] exchange failed', error);
            toast.error('Sign-in failed', error);
          } else {
            console.info('[auth] signed in');
            toast.success('Signed in');
            // Capture the fresh provider token + username right now — the
            // session.provider_token only sticks around for the SIGNED_IN
            // moment, so we have to grab it before any cache rotation.
            const captured = await syncGitHubCredentialsFromSession();
            qc.invalidateQueries({ queryKey: ['github'] });
            if (!captured) {
              console.warn('[auth] no provider_token captured — Supabase may have stripped it. User can click Reconnect.');
            }
          }
          return;
        }

        if (u.host === 'accept-invite' && path) {
          const token = decodeURIComponent(path);
          window.localStorage.setItem(PENDING_INVITE_KEY, token);
          console.info('[invite] captured token', token.slice(0, 8) + '…');
          toast.info('Invitation captured', 'Sign in to accept.');
        }
      } catch (e) {
        console.error('[auth] deep link handler threw', e);
        toast.error('Deep link error', (e as Error).message);
      }
    });
  }, []);

  useEffect(() => {
    if (state?.status !== 'authenticated' || !state.user) return;
    const token = window.localStorage.getItem(PENDING_INVITE_KEY);
    if (!token) return;
    if (acceptedRef.current.has(token)) return;
    acceptedRef.current.add(token);

    (async () => {
      console.info('[invite] redeeming token after sign-in');
      const result = await acceptPendingInvite(token);
      if (result.ok) {
        window.localStorage.removeItem(PENDING_INVITE_KEY);
        toast.success('Joined workspace', 'You now have access to shared projects.');
        qc.invalidateQueries({ queryKey: ['workspaces'] });
        qc.invalidateQueries({ queryKey: ['projects'] });
        qc.invalidateQueries({ queryKey: ['notifications'] });

        // Auto-request collaborator access on every cloud project that has a
        // repo URL. Edge function silently fails when the workspace owner
        // has no PAT or this user has no github_username — we just log.
        try {
          const me = await getMyGitHubCredentials();
          if (!me?.githubUsername) {
            toast.info('Set your GitHub username',
              'Settings → Integrations to receive auto repo access.');
            return;
          }
          const projects = await listProjects({});
          const eligible = projects.filter((p) => p.repoUrl);
          if (eligible.length === 0) return;
          let granted = 0;
          for (const p of eligible) {
            const r = await grantRepoAccess({ projectId: p.id });
            if (r.ok) granted++;
          }
          if (granted > 0) {
            toast.success(`Repo access granted on ${granted}/${eligible.length} project(s)`);
          }
        } catch (e) {
          console.warn('[invite] auto repo grant failed', e);
        }
      } else {
        toast.error('Could not accept invitation', result.message ?? 'unknown error');
        window.localStorage.removeItem(PENDING_INVITE_KEY);
      }
    })();
  }, [state?.status, state?.user?.id, qc]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (state?.status !== 'authenticated') {
    return <SignInScreen />;
  }
  return <>{children}</>;
}
