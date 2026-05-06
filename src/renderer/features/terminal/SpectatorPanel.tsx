import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSupabase } from '@/lib/supabase';
import {
  useActiveSessionsForProject,
  useSessionEventsRealtime,
  useSessionRealtime,
  listEventsForSession,
  type AiSession,
  type AiSessionEvent
} from '@/lib/data/aiSessions';

function useCurrentUserId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const supabase = getSupabase();
    void supabase.auth.getUser().then(({ data }) => setId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setId(session?.user?.id ?? null);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);
  return id;
}

export function SpectatorPanel({ projectId }: { projectId: string }) {
  const sessions = useActiveSessionsForProject(projectId);
  const me = useCurrentUserId();
  const others = sessions.filter((s) => s.ownerUserId !== me);

  if (others.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4" />
            Active sessions
          </CardTitle>
          <CardDescription>
            No teammates have an active terminal in this project right now.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="h-4 w-4" />
          Active sessions
        </CardTitle>
        <CardDescription>
          {others.length} teammate session{others.length === 1 ? '' : 's'} in flight. Click to spectate read-only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {others.map((s) => <SpectatorRow key={s.id} session={s} />)}
      </CardContent>
    </Card>
  );
}

function SpectatorRow({ session }: { session: AiSession }) {
  const [open, setOpen] = useState(false);
  const isEnded = session.status === 'ended' || session.status === 'failed';
  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center justify-between p-3">
        <div className="text-sm">
          <div className="font-medium">
            {session.label ?? session.command}
            <span className="ml-2 text-xs text-muted-foreground">
              {session.provider}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            owned by user {session.ownerUserId.slice(0, 8)}…
            {' · '}
            started {new Date(session.startedAt).toLocaleTimeString()}
            {' · '}
            <span className={isEnded ? 'text-muted-foreground' : 'text-emerald-500'}>
              {session.status}
            </span>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? <><EyeOff className="h-3.5 w-3.5" /> Stop watching</> : <><Eye className="h-3.5 w-3.5" /> Spectate</>}
        </Button>
      </div>
      {open && <SpectatorTerm sessionId={session.id} />}
    </div>
  );
}

function SpectatorTerm({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      fontFamily: 'JetBrains Mono, Consolas, Menlo, monospace',
      fontSize: 12,
      cursorBlink: false,
      disableStdin: true,
      theme: { background: '#0a0a0b' },
      convertEol: true
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    const onResize = (): void => fit.fit();
    window.addEventListener('resize', onResize);

    // backfill history
    void listEventsForSession(sessionId, 500).then((events) => {
      for (const e of events) writeEvent(term, e);
    });

    return () => {
      window.removeEventListener('resize', onResize);
      term.dispose();
      termRef.current = null;
    };
  }, [sessionId]);

  const onEvent = useCallback((e: AiSessionEvent) => {
    const term = termRef.current;
    if (!term) return;
    writeEvent(term, e);
  }, []);
  useSessionEventsRealtime(sessionId, onEvent);

  const onUpdate = useCallback((s: AiSession) => {
    if (s.status === 'ended' || s.status === 'failed') {
      termRef.current?.write(`\r\n\x1b[2m[session ${s.status}, exit ${s.exitCode ?? '?'}]\x1b[0m\r\n`);
    }
  }, []);
  useSessionRealtime(sessionId, onUpdate);

  return <div ref={containerRef} className="h-[320px] w-full overflow-hidden rounded-md border border-border bg-black" />;
}

function writeEvent(term: Terminal, e: AiSessionEvent): void {
  if (!e.payload) return;
  if (e.kind === 'stdin') {
    term.write(`\x1b[33m${e.payload}\x1b[0m`);
  } else if (e.kind === 'stderr') {
    term.write(`\x1b[31m${e.payload}\x1b[0m`);
  } else {
    term.write(e.payload);
  }
}
