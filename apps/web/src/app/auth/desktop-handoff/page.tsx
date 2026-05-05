'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function DesktopHandoffPage() {
  const supabase = getSupabaseBrowserClient();
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        setStatus('error');
        return;
      }
      const { access_token, refresh_token, expires_at } = data.session;
      const url = `vibeops://auth?access_token=${encodeURIComponent(access_token)}&refresh_token=${encodeURIComponent(refresh_token)}&expires_at=${expires_at ?? ''}`;
      window.location.href = url;
      setStatus('done');
    })();
  }, [supabase]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-center">
      <div className="max-w-sm space-y-3">
        {status === 'loading' && <p>Signing you in…</p>}
        {status === 'done' && (
          <>
            <h1 className="text-2xl font-semibold">Returning to VibeOps</h1>
            <p className="text-sm text-muted-foreground/80">
              If the desktop app didn&apos;t open automatically, you can close this tab and re-open VibeOps.
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-2xl font-semibold">Sign-in failed</h1>
            <p className="text-sm text-muted-foreground/80">Please try again from the app.</p>
          </>
        )}
      </div>
    </main>
  );
}
