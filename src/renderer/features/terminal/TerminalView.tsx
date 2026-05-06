import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Play, Square, RotateCcw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { TerminalSession } from '@shared/types';
import {
  createAiSession,
  appendSessionEvent,
  endSession as endAiSession,
  recordSessionDiff,
  toggleSessionControl,
  useControlKeystrokeReceiver,
  useSessionRealtime,
  listEventsForSession,
  type AiSession
} from '@/lib/data/aiSessions';
import { useUserLabel } from '@/lib/data/useWorkspaceUserLabels';

interface Props {
  cwd: string;
  command?: string;
  args?: string[];
  label?: string;
  cloud?: { projectId: string; workspaceId: string };
  onAiSessionChange?: (info: { aiSessionId: string; cwd: string; sessionStartSha: string | null } | null) => void;
  /** When true, no pop-out button (used by the popout window itself). */
  hidePopout?: boolean;
  /** Display label like "Terminal #2" in the toolbar. */
  terminalNumber?: number;
  /**
   * Bind to an already-running terminal session instead of showing Start.
   * Used by the pop-out window so closing the popout doesn't kill the PTY.
   */
  attach?: {
    localTerminalId: string;
    aiSessionId: string;
    sessionStartSha: string | null;
  };
  /** When true, this view doesn't kill the PTY/AI session on unmount. */
  keepSessionOnUnmount?: boolean;
  /** Fires when user clicks Pop out — parent can hide this cell. */
  onPopOutRequested?: () => void;
  /** Fires whenever the local terminal session id changes (start / exit). */
  onLocalSessionChange?: (localTerminalId: string | null) => void;
}

interface Preset { label: string; command: string; args: string[]; provider: string }
const COMMAND_PRESETS: Preset[] = [
  { label: 'OS Shell', command: '', args: [], provider: 'shell' },
  { label: 'Claude Code (new)', command: 'claude', args: [], provider: 'claude' },
  { label: 'Claude Code (continue last)', command: 'claude', args: ['--continue'], provider: 'claude' },
  { label: 'Claude Code (pick session)', command: 'claude', args: ['--resume'], provider: 'claude' },
  { label: 'Codex CLI', command: 'codex', args: [], provider: 'codex' },
  { label: 'Codex CLI (resume)', command: 'codex', args: ['--resume'], provider: 'codex' },
  { label: 'PowerShell', command: 'powershell.exe', args: ['-NoLogo'], provider: 'shell' },
  { label: 'bash', command: 'bash', args: ['-l'], provider: 'shell' }
];

export function TerminalView({
  cwd, command, args, label, cloud, onAiSessionChange, hidePopout,
  terminalNumber, attach, keepSessionOnUnmount, onPopOutRequested,
  onLocalSessionChange
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [session, setSession] = useState<TerminalSession | null>(null);
  const [presetIndex, setPresetIndex] = useState(0);
  const [aiSessionId, setAiSessionId] = useState<string | null>(null);
  const [controlOpen, setControlOpen] = useState(false);
  const [controllerLabel, setControllerLabel] = useState<string | null>(null);
  const localSessionIdRef = useRef<string | null>(null);

  // Refs so listeners registered once on mount can route per-session events
  // without resubscribing each time session/aiSessionId changes.
  const activeSessionIdRef = useRef<string | null>(null);
  const aiSessionIdRef = useRef<string | null>(null);
  const cloudProjectIdRef = useRef<string | null>(cloud?.projectId ?? null);
  const onAiSessionChangeRef = useRef(onAiSessionChange);
  const onLocalSessionChangeRef = useRef(onLocalSessionChange);
  /** Set when the user clicks Stop so we can suppress trailing chunks and
   *  reset the UI to a fresh blank state instead of showing exit chrome. */
  const userStoppedRef = useRef(false);

  useEffect(() => { cloudProjectIdRef.current = cloud?.projectId ?? null; }, [cloud?.projectId]);
  useEffect(() => { onAiSessionChangeRef.current = onAiSessionChange; }, [onAiSessionChange]);
  useEffect(() => { onLocalSessionChangeRef.current = onLocalSessionChange; }, [onLocalSessionChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      fontFamily: 'JetBrains Mono, Consolas, Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: { background: '#0a0a0b' }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const onResize = () => fit.fit();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      // Tear down any live terminal session attached to this view UNLESS
      // we're a pop-out / cell that's holding the session for someone else.
      const localId = activeSessionIdRef.current;
      if (localId && !keepSessionOnUnmount) {
        userStoppedRef.current = true;
        void api.terminal.kill(localId).catch(() => {});
        const aiId = aiSessionIdRef.current;
        if (aiId) {
          void endAiSession(aiId, null).catch(() => {});
          aiSessionIdRef.current = null;
        }
        void api.aiSession.stopWatch(localId).catch(() => {});
        activeSessionIdRef.current = null;
      }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [keepSessionOnUnmount]);

  // Attach mode: bind to an already-running session instead of letting the
  // user click Start. Used by the pop-out window so the session continues
  // running uninterrupted.
  useEffect(() => {
    if (!attach || !termRef.current) return;
    activeSessionIdRef.current = attach.localTerminalId;
    aiSessionIdRef.current = attach.aiSessionId;
    setSession({
      id: attach.localTerminalId,
      command: command ?? 'attached',
      args: args ?? [],
      cwd,
      label: label ?? 'attached',
      lineMode: false,
      startedAt: new Date().toISOString(),
      endedAt: null,
      exitCode: null
    });
    onAiSessionChangeRef.current?.({
      aiSessionId: attach.aiSessionId,
      cwd,
      sessionStartSha: attach.sessionStartSha
    });

    // Backfill history from ai_session_events so the popped-out xterm shows
    // everything that's already happened, not just live chunks.
    const term = termRef.current;
    void listEventsForSession(attach.aiSessionId, 1000).then((events) => {
      for (const e of events) {
        if (!e.payload) continue;
        if (e.kind === 'stderr') term.write(`\x1b[31m${e.payload}\x1b[0m`);
        else if (e.kind === 'stdin') {/* skip — the source PTY already echoes */}
        else term.write(e.payload);
      }
    }).catch(() => {});
  }, [attach?.localTerminalId, attach?.aiSessionId, attach?.sessionStartSha, command, args, label, cwd]);

  // Persistent IPC listeners — registered once on mount so the PTY's first
  // chunk after spawn is never dropped due to a useEffect resubscribe race.
  useEffect(() => {
    const offData = api.terminal.onData((evt) => {
      if (evt.sessionId !== activeSessionIdRef.current) return;
      // After Stop, drop trailing PTY chunks so the wipe stays clean.
      if (userStoppedRef.current) return;
      termRef.current?.write(evt.chunk);
      const aiId = aiSessionIdRef.current;
      if (aiId) appendSessionEvent(aiId, evt.stream === 'stderr' ? 'stderr' : 'stdout', evt.chunk);
    });
    const offExit = api.terminal.onExit((evt) => {
      if (evt.sessionId !== activeSessionIdRef.current) return;
      const wasUserStop = userStoppedRef.current;
      userStoppedRef.current = false;

      if (wasUserStop) {
        // Wipe the screen and drop the session entirely so the UI shows a
        // blank canvas + Start button, not "exited with code X".
        termRef.current?.reset();
        setSession(null);
      } else {
        termRef.current?.write(`\r\n[process exited with code ${evt.exitCode ?? 'null'}]\r\n`);
        setSession((prev) => prev && prev.id === evt.sessionId
          ? { ...prev, endedAt: evt.endedAt, exitCode: evt.exitCode }
          : prev);
      }

      const aiId = aiSessionIdRef.current;
      if (aiId) {
        void endAiSession(aiId, evt.exitCode);
        aiSessionIdRef.current = null;
        onAiSessionChangeRef.current?.(null);
      }
      setAiSessionId(null);
      setControlOpen(false);
      setControllerLabel(null);
      localSessionIdRef.current = null;
      void api.aiSession.stopWatch(evt.sessionId).catch(() => {});
      if (activeSessionIdRef.current === evt.sessionId) {
        activeSessionIdRef.current = null;
        onLocalSessionChangeRef.current?.(null);
      }
    });
    const offDiff = api.aiSession.onDiff((evt) => {
      if (evt.clientLocalId !== activeSessionIdRef.current) return;
      const aiId = aiSessionIdRef.current;
      const projectId = cloudProjectIdRef.current;
      if (!aiId || !projectId) return;
      void recordSessionDiff({
        sessionId: aiId,
        projectId,
        filePath: evt.filePath,
        diffKind: evt.diffKind,
        beforeHash: evt.beforeHash,
        afterHash: evt.afterHash,
        sizeBytes: evt.sizeBytes
      });
    });
    return () => { offData(); offExit(); offDiff(); };
  }, []);

  // Forward xterm resize events to the PTY so output reflows correctly.
  useEffect(() => {
    if (!session || session.endedAt) return;
    const term = termRef.current;
    if (!term) return;
    const sub = term.onResize(({ cols, rows }) => {
      void api.terminal.resize(session.id, cols, rows);
    });
    return () => sub.dispose();
  }, [session?.id, session?.endedAt]);

  // Raw stdin pass-through: PTY handles line editing, history, escape sequences.
  useEffect(() => {
    if (!session || session.endedAt) return;
    const term = termRef.current;
    if (!term) return;
    const sub = term.onData((data) => {
      void api.terminal.write(session.id, data);
      const aiId = aiSessionIdRef.current;
      if (aiId) appendSessionEvent(aiId, 'stdin', data);
    });
    return () => sub.dispose();
  }, [session?.id, session?.endedAt]);

  async function start() {
    try {
      const preset = COMMAND_PRESETS[presetIndex] ?? COMMAND_PRESETS[0]!;
      const term = termRef.current;
      const fit = fitRef.current;
      if (term && fit) fit.fit();
      const cols = term?.cols ?? 80;
      const rows = term?.rows ?? 30;

      const startArgs: { cwd: string; command?: string; args?: string[]; label?: string; cols: number; rows: number } = {
        cwd, cols, rows
      };
      if (command) startArgs.command = command;
      else if (preset.command) startArgs.command = preset.command;
      if (args) startArgs.args = args;
      else if (preset.args.length) startArgs.args = preset.args;
      startArgs.label = label ?? preset.label;

      const s = await api.terminal.start(startArgs);
      activeSessionIdRef.current = s.id;
      onLocalSessionChange?.(s.id);
      term?.clear();
      term?.writeln(`\x1b[2m[started ${s.command} in ${s.cwd}]\x1b[0m`);
      setSession(s);

      if (cloud) {
        try {
          const watchResult = await api.aiSession.startWatch(s.id, s.cwd).catch(() => ({ sha: null }));
          const aiId = await createAiSession({
            workspaceId: cloud.workspaceId,
            projectId: cloud.projectId,
            provider: preset.provider,
            command: s.command,
            args: s.args,
            cwd: s.cwd,
            label: s.label,
            clientLocalId: s.id,
            sessionStartSha: watchResult.sha
          });
          aiSessionIdRef.current = aiId;
          setAiSessionId(aiId);
          localSessionIdRef.current = s.id;
          onAiSessionChange?.({ aiSessionId: aiId, cwd: s.cwd, sessionStartSha: watchResult.sha });
        } catch (e) {
          await api.terminal.kill(s.id).catch(() => {});
          await api.aiSession.stopWatch(s.id).catch(() => {});
          aiSessionIdRef.current = null;
          throw e;
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('AI_SESSION_LIMIT')) {
        toast.error('Concurrent AI session limit reached', 'Upgrade to Pro for 5 concurrent sessions, or end an existing one.');
      } else {
        toast.error('Could not start terminal', msg);
      }
    }
  }

  async function stop() {
    if (!session) return;
    userStoppedRef.current = true;
    await api.terminal.kill(session.id);
  }

  async function onToggleControl(): Promise<void> {
    if (!aiSessionId) return;
    const next = !controlOpen;
    try {
      const updated = await toggleSessionControl(aiSessionId, next);
      setControlOpen(updated.controlOpen);
      if (!updated.controlOpen) setControllerLabel(null);
      toast.info(next ? 'Remote control opened' : 'Remote control closed',
        next ? 'Teammates can now claim the keyboard.' : undefined);
    } catch (e) {
      toast.error('Could not toggle control', (e as Error).message);
    }
  }

  // Owner-side: watch session row to learn who's currently controlling.
  const onSessionUpdate = useCallback((s: AiSession) => {
    setControlOpen(s.controlOpen);
    setControllerLabel(s.controllerUserId);
  }, []);
  useSessionRealtime(aiSessionId, onSessionUpdate);

  // Owner-side: forward broadcast keystrokes from the active controller into
  // the local PTY. Drop messages from anyone other than the claimed controller.
  // controllerLabel here is the controller user id (string) — we resolve to a
  // friendly label below for display only.
  const onRemoteKey = useCallback((data: string, fromUserId: string) => {
    if (!controlOpen) return;
    if (controllerLabel && fromUserId !== controllerLabel) return;
    const localId = localSessionIdRef.current;
    if (!localId) return;
    void api.terminal.write(localId, data);
  }, [controlOpen, controllerLabel]);
  useControlKeystrokeReceiver(aiSessionId, onRemoteKey);

  const driverLabel = useUserLabel(cloud?.workspaceId ?? null, controllerLabel);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {terminalNumber !== undefined && (
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium">
            #{terminalNumber}
          </span>
        )}
        {!command && (
          <select
            value={presetIndex}
            onChange={(e) => setPresetIndex(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background text-foreground px-3 text-sm shadow-sm"
            disabled={!!session && !session.endedAt}
          >
            {COMMAND_PRESETS.map((p, i) => (
              <option key={p.label} value={i} className="bg-background text-foreground">{p.label}</option>
            ))}
          </select>
        )}
        {!session || session.endedAt ? (
          <Button onClick={start}>
            {session?.endedAt ? <><RotateCcw className="h-4 w-4" /> Restart</> : <><Play className="h-4 w-4" /> Start</>}
          </Button>
        ) : (
          <Button variant="destructive" onClick={stop}>
            <Square className="h-4 w-4" /> Stop
          </Button>
        )}
        {!hidePopout && cloud && session && !session.endedAt && aiSessionIdRef.current && (
          <Button
            variant="outline"
            size="sm"
            title="Open this terminal in a separate window — the session keeps running."
            onClick={() => {
              const localId = activeSessionIdRef.current;
              const aiId = aiSessionIdRef.current;
              if (!localId || !aiId) return;
              void api.terminal.popout({
                projectId: cloud.projectId,
                cwd,
                localTerminalId: localId,
                aiSessionId: aiId,
                title: terminalNumber ? `VibeOps Terminal #${terminalNumber}` : 'VibeOps Terminal'
              }).catch(() => {});
              onPopOutRequested?.();
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" /> Pop out
          </Button>
        )}
        {session && (
          <span className="text-xs text-muted-foreground">
            {session.endedAt
              ? `${session.label} · exited ${session.exitCode ?? '?'}`
              : `${session.label} · running`}
          </span>
        )}
        {cloud && session && !session.endedAt && (
          <span className="text-xs text-emerald-500">streaming to teammates</span>
        )}
        {cloud && aiSessionId && session && !session.endedAt && (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={controlOpen}
              onChange={() => void onToggleControl()}
            />
            Allow remote control
            {controlOpen && controllerLabel && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                {driverLabel ?? controllerLabel.slice(0, 8) + '…'} driving
              </span>
            )}
          </label>
        )}
      </div>
      <div
        ref={containerRef}
        className="h-[480px] w-full overflow-hidden rounded-md border border-border bg-black"
      />
    </div>
  );
}
