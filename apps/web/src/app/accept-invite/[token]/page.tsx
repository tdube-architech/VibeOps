'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

interface InvitationPreview {
  workspace_id: string;
  workspace_name: string;
  role: string;
  email: string;
  expires_at: string;
}

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const supabase = getSupabaseBrowserClient();
  const [invite, setInvite] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('invitations')
        .select('workspace_id, role, email, expires_at, workspaces(name)')
        .eq('token', token)
        .is('accepted_at', null)
        .single();
      if (error || !data) { setError('Invitation not found or already used.'); return; }
      const ws = (data as { workspaces?: { name?: string } }).workspaces;
      setInvite({
        workspace_id: data.workspace_id as string,
        workspace_name: ws?.name ?? 'Workspace',
        role: data.role as string,
        email: data.email as string,
        expires_at: data.expires_at as string
      });
    })();
  }, [token, supabase]);

  async function handleAccept() {
    setBusy(true);
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      window.location.href = `/auth/sign-in?next=${encodeURIComponent(`/accept-invite/${token}`)}`;
      return;
    }
    const { error } = await supabase.rpc('accept_invitation', { invite_token: token });
    if (error) { setError(error.message); setBusy(false); return; }
    window.location.href = '/auth/desktop-handoff';
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-2xl font-semibold">Invitation problem</h1>
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </main>
    );
  }
  if (!invite) {
    return <main className="flex min-h-screen items-center justify-center px-6">Loading invitation…</main>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-border bg-muted/40 p-6 text-center">
        <h1 className="text-2xl font-bold">You&apos;re invited</h1>
        <p>
          Join <span className="font-semibold">{invite.workspace_name}</span> as <span className="font-mono">{invite.role}</span>.
        </p>
        <button
          onClick={handleAccept}
          disabled={busy}
          className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? 'Joining…' : 'Accept invitation'}
        </button>
      </div>
    </main>
  );
}
