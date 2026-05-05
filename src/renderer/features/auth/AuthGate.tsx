import { useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useAuth, exchangeCodeForSession } from './useAuth';
import { SignInScreen } from './SignInScreen';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { state, loading } = useAuth();

  useEffect(() => {
    return api.auth.onDeepLink(async (url) => {
      console.info('[auth] deep link received:', url);
      try {
        const u = new URL(url);
        console.info('[auth] parsed url', { host: u.host, pathname: u.pathname, params: [...u.searchParams.keys()] });
        if (u.host === 'auth' && u.pathname.replace(/^\/+/, '') === 'callback') {
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
          }
        }
      } catch (e) {
        console.error('[auth] deep link handler threw', e);
        toast.error('Deep link error', (e as Error).message);
      }
    });
  }, []);

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
