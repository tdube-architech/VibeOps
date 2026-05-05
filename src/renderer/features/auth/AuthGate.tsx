import { useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useAuth, exchangeCodeForSession } from './useAuth';
import { SignInScreen } from './SignInScreen';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { state, loading } = useAuth();

  useEffect(() => {
    return api.auth.onDeepLink(async (url) => {
      try {
        const u = new URL(url);
        if (u.host === 'auth' && u.pathname.replace(/^\/+/, '') === 'callback') {
          const code = u.searchParams.get('code');
          if (!code) return;
          const { error } = await exchangeCodeForSession(code);
          if (error) toast.error('Sign-in failed', error);
          else toast.success('Signed in');
        }
      } catch (e) {
        toast.error('Deep link error', (e as Error).message);
      }
    });
  }, []);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (state?.status !== 'authenticated') {
    return <SignInScreen />;
  }
  return <>{children}</>;
}
