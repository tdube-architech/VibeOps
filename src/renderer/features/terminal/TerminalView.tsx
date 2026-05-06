import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Play, Square, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { TerminalSession } from '@shared/types';
import {
  createAiSession,
  appendSessionEvent,
  endSession as endAiSession,
  recordSessionDiff
} from '@/lib/data/aiSessions';

interface Props {
  cwd: string;
  command?: string;
  args?: string[];
  label?: string;
  cloud?: { projectId: string; workspaceId: string };
  onAiSessionChange?: (info: { aiSessionId: string; cwd: string; sessionStartSha: string | null } | null) => void;
}

interface Preset { label: string; command: string; args: string[]; provider: string }
const COMMAND_PRESETS: Preset[] = [
  { label: 'OS Shell', command: '', args: [], provider: 'shell' },
  { label: 'Claude Code', command: 'claude', args: [], provider: 'claude' },
  { label: 'Codex CLI', command: 'codex', args: [], provider: 'codex' },
  { label: 'PowerShell', command: 'powershell.exe', args: ['-NoLogo'], provider: 'shell' },
  { label: 'bash', command: 'bash', args: ['-l'], provider: 'shell' }
];

export function TerminalView({ cwd, command, args, label, cloud, onAiSessionChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [session, setSession] = useState<TerminalSession | null>(null);
  const [presetIndex, setPresetIndex] = useState(0);

  // Refs so listeners registered once on mount can route per-session events
  // without resubscribing each time session/aiSessionId changes.
  const activeSessionIdRef = useRef<string | null>(null);
  const aiSessionIdRef = useRef<string | null>(null);
  const cloudProjectIdRef = useRef<string | null>(cloud?.projectId ?? null);
  const onAiSessionChangeRef = useRef(onAiSessionChange);

  useEffect(() => { cloudProjectIdRef.current = cloud?.projectId ?? null; }, [cloud?.projectId]);
  useEffect(() => { onAiSessionChangeRef.current = onAiSessionChange; }, [onAiSessionChange]);

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
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Persistent IPC listeners — registered once on mount so the PTY's first
  // chunk after spawn is never dropped due to a useEffect resubscribe race.
  useEffect(() => {
    const offData = api.terminal.onData((evt) => {
      if (evt.sessionId !== activeSessionIdRef.current) return;
      termRef.current?.write(evt.chunk);
      const aiId = aiSessionIdRef.current;
      if (aiId) appendSessionEvent(aiId, evt.stream === 'stderr' ? 'stderr' : 'stdout', evt.chunk);
    });
    const offExit = api.terminal.onExit((evt) => {
      if (evt.sessionId !== activeSessionIdRef.current) return;
      termRef.current?.write(`\r\n[process exited with code ${evt.exitCode ?? 'null'}]\r\n`);
      setSession((prev) => prev && prev.id === evt.sessionId
        ? { ...prev, endedAt: evt.endedAt, exitCode: evt.exitCode }
        : prev);
      const aiId = aiSessionIdRef.current;
      if (aiId) {
        void endAiSession(aiId, evt.exitCode);
        aiSessionIdRef.current = null;
        onAiSessionChangeRef.current?.(null);
      }
      void api.aiSession.stopWatch(evt.sessionId).catch(() => {});
      if (activeSessionIdRef.current === evt.sessionId) activeSessionIdRef.current = null;
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
    await api.terminal.kill(session.id);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
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
      </div>
      <div
        ref={containerRef}
        className="h-[480px] w-full overflow-hidden rounded-md border border-border bg-black"
      />
    </div>
  );
}
