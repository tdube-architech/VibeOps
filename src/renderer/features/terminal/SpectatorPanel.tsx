import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Keyboard, Hand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSupabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import {
  useActiveSessionsForProject,
  useSessionEventsRealtime,
  useSessionRealtime,
  listEventsForSession,
  claimSessionControl,
  releaseSessionControl,
  useControlKeystrokeSender,
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
          {others.length} teammate session{others.length === 1 ? '' : 's'} in flight. Click Spectate to follow along — when the owner opens remote control, you can also drive.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {others.map((s) => <SpectatorRow key={s.id} session={s} myUserId={me} />)}
      </CardContent>
    </Card>
  );
}

function SpectatorRow({ session, myUserId }: { session: AiSession; myUserId: string | null }) {
  const [open, setOpen] = useState(false);
  // We track session state here so the row reflects control_open changes
  // even before the spectator opens the embedded terminal.
  const [live, setLive] = useState<AiSession>(session);
  useEffect(() => { setLive(session); }, [session]);
  const onUpdate = useCallback((s: AiSession) => setLive(s), []);
  useSessionRealtime(session.id, onUpdate);

  const isEnded = live.status === 'ended' || live.status === 'failed';
  const iAmController = live.controllerUserId === myUserId;

  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center justify-between p-3">
        <div className="text-sm">
          <div className="font-medium">
            {live.label ?? live.command}
            <span className="ml-2 text-xs text-muted-foreground">{live.provider}</span>
            {live.controlOpen && (
              <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[11px] text-emerald-300">
                remote control open
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            owned by user {live.ownerUserId.slice(0, 8)}…
            {' · '}
            started {new Date(live.startedAt).toLocaleTimeString()}
            {' · '}
            <span className={isEnded ? 'text-muted-foreground' : 'text-emerald-500'}>{live.status}</span>
            {live.controllerUserId && (
              <> · driver: {iAmController ? 'you' : `${live.controllerUserId.slice(0, 8)}…`}</>
            )}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? <><EyeOff className="h-3.5 w-3.5" /> Stop watching</> : <><Eye className="h-3.5 w-3.5" /> Spectate</>}
        </Button>
      </div>
      {open && <SpectatorTerm session={live} myUserId={myUserId} />}
    </div>
  );
}

function SpectatorTerm({ session, myUserId }: { session: AiSession; myUserId: string | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const iAmController = session.controllerUserId === myUserId;
  const controlAvailable = session.controlOpen
    && session.status !== 'ended' && session.status !== 'failed';

  // Persistent xterm instance — toggles disableStdin based on control state.
  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      fontFamily: 'JetBrains Mono, Consolas, Menlo, monospace',
      fontSize: 12,
      cursorBlink: iAmController,
      disableStdin: !iAmController,
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

    void listEventsForSession(session.id, 500).then((events) => {
      for (const e of events) writeEvent(term, e);
    });

    return () => {
      window.removeEventListener('resize', onResize);
      term.dispose();
      termRef.current = null;
    };
  }, [session.id]);

  // Toggle stdin on the live xterm when control state changes.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.disableStdin = !iAmController;
    term.options.cursorBlink = iAmController;
  }, [iAmController]);

  const onEvent = useCallback((e: AiSessionEvent) => {
    const term = termRef.current;
    if (!term) return;
    writeEvent(term, e);
  }, []);
  useSessionEventsRealtime(session.id, onEvent);

  // Keystroke sender (no-op when not controlling).
  const sendKey = useControlKeystrokeSender(
    iAmController ? session.id : null,
    iAmController ? myUserId : null
  );
  useEffect(() => {
    const term = termRef.current;
    if (!term || !iAmController) return;
    const sub = term.onData((data) => sendKey(data));
    return () => sub.dispose();
  }, [iAmController, sendKey]);

  async function claim(): Promise<void> {
    try { await claimSessionControl(session.id); }
    catch (e) { toast.error('Could not take control', (e as Error).message); }
  }
  async function release(): Promise<void> {
    try { await releaseSessionControl(session.id); }
    catch (e) { toast.error('Could not release control', (e as Error).message); }
  }

  return (
    <div className="space-y-2 p-3 pt-0">
      {controlAvailable && (
        <div className="flex items-center gap-2 text-xs">
          {iAmController ? (
            <>
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-amber-300">
                <Keyboard className="mr-1 inline h-3 w-3" /> You have control — typing is forwarded
              </span>
              <Button size="sm" variant="outline" onClick={() => void release()}>
                Release control
              </Button>
            </>
          ) : session.controllerUserId ? (
            <>
              <span className="text-muted-foreground">
                {session.controllerUserId.slice(0, 8)}… is driving.
              </span>
              <Button size="sm" variant="outline" onClick={() => void claim()}>
                <Hand className="h-3 w-3" /> Take over
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => void claim()}>
              <Hand className="h-3 w-3" /> Take control
            </Button>
          )}
        </div>
      )}
      {!controlAvailable && session.status !== 'ended' && session.status !== 'failed' && (
        <div className="text-[11px] text-muted-foreground">
          The owner hasn't opened remote control. Read-only.
        </div>
      )}
      <div ref={containerRef} className="h-[320px] w-full overflow-hidden rounded-md border border-border bg-black" />
    </div>
  );
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
