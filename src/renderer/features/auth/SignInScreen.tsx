import { useState } from 'react';
import { LogIn, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { signInWithGitHub, signInWithMagicLink } from './useAuth';
import { isSupabaseConfigured } from '@/lib/supabase';

export function SignInScreen() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

  async function onMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setErr(null);
    const { error } = await signInWithMagicLink(email);
    setSending(false);
    if (error) setErr(error);
    else setSent(true);
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Sign in to VibeOps</CardTitle>
          <CardDescription>Use GitHub or a magic link to your email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!configured && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              Supabase is not configured. Set RENDERER_VITE_SUPABASE_URL and
              RENDERER_VITE_SUPABASE_ANON_KEY in .env then rebuild.
            </div>
          )}
          <Button
            className="w-full"
            variant="outline"
            disabled={!configured}
            onClick={() => { void signInWithGitHub(); }}
          >
            <LogIn className="h-4 w-4" /> Continue with GitHub
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          {sent ? (
            <div className="rounded-md border border-border p-3 text-sm">
              Check <span className="font-medium">{email}</span> for a sign-in link.
              Click it; the app will open automatically.
            </div>
          ) : (
            <form onSubmit={onMagicLink} className="space-y-3">
              <Input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!configured}
              />
              <Button type="submit" className="w-full" disabled={!configured || sending}>
                <Mail className="h-4 w-4" /> {sending ? 'Sending…' : 'Send magic link'}
              </Button>
              {err && <div className="text-sm text-destructive">{err}</div>}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
