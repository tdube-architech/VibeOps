import { customAlphabet } from 'nanoid';
import type { Logger } from 'pino';
import type { BrowserWindow } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';

type PtyModule = typeof import('node-pty');
type IPty = ReturnType<PtyModule['spawn']>;

const newSessionId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

export interface TerminalStartArgs {
  cwd: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /** Friendly label shown to the user; the renderer can use this to title the tab. */
  label?: string;
  /** Initial terminal grid size. Renderer fits xterm and reports back. */
  cols?: number;
  rows?: number;
}

export interface TerminalSession {
  id: string;
  command: string;
  args: string[];
  cwd: string;
  label: string;
  /** Always true now that we have a real PTY. Kept for backwards compat in shared types. */
  lineMode: boolean;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
}

interface TerminalDataEvent {
  sessionId: string;
  chunk: string;
  stream: 'stdout' | 'stderr';
}

interface TerminalExitEvent {
  sessionId: string;
  exitCode: number | null;
  endedAt: string;
}

interface TrackedSession extends TerminalSession {
  proc: IPty;
}

export interface TerminalServiceDeps {
  logger: Logger;
  getMainWindow: () => BrowserWindow | null;
}

const ALLOWED_COMMANDS = new Set([
  'cmd', 'cmd.exe',
  'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe',
  'bash', 'sh', 'zsh',
  'claude', 'claude.cmd', 'claude.exe',
  'codex', 'codex.cmd', 'codex.exe',
  'node', 'node.exe',
  'npm', 'npm.cmd', 'npx', 'npx.cmd',
  'pnpm', 'pnpm.cmd',
  'git', 'git.exe'
]);

function defaultShell(): { command: string; args: string[]; label: string } {
  if (process.platform === 'win32') {
    return { command: 'cmd.exe', args: [], label: 'Command Prompt' };
  }
  return { command: '/bin/bash', args: ['-l'], label: 'bash' };
}

let ptyModulePromise: Promise<PtyModule | null> | null = null;
async function loadPty(logger: Logger): Promise<PtyModule | null> {
  if (!ptyModulePromise) {
    ptyModulePromise = import('node-pty')
      .then((mod) => mod as PtyModule)
      .catch((err: unknown) => {
        logger.error({ err: (err as Error).message }, 'failed to load node-pty');
        return null;
      });
  }
  return ptyModulePromise;
}

export class TerminalService {
  private sessions = new Map<string, TrackedSession>();

  constructor(private readonly deps: TerminalServiceDeps) {}

  list(): TerminalSession[] {
    return [...this.sessions.values()].map(detach);
  }

  async start(args: TerminalStartArgs): Promise<TerminalSession> {
    const fallback = defaultShell();
    const command = args.command || fallback.command;
    const cmdArgs = args.args ?? (args.command ? [] : fallback.args);

    if (command !== fallback.command && !this.isAllowed(command)) {
      throw new Error(`Command '${command}' is not in the allow-list.`);
    }

    const pty = await loadPty(this.deps.logger);
    if (!pty) {
      throw new Error('Terminal backend (node-pty) failed to load. Reinstall dependencies.');
    }

    const id = `term_${newSessionId()}`;
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === 'string') env[k] = v;
    }
    Object.assign(env, args.env ?? {}, { TERM: 'xterm-256color' });

    const proc = pty.spawn(command, cmdArgs, {
      name: 'xterm-256color',
      cols: args.cols ?? 80,
      rows: args.rows ?? 30,
      cwd: args.cwd,
      env,
      useConpty: process.platform === 'win32'
    });

    const startedAt = new Date().toISOString();
    const session: TrackedSession = {
      id,
      command,
      args: cmdArgs,
      cwd: args.cwd,
      label: args.label ?? command,
      lineMode: false,
      startedAt,
      endedAt: null,
      exitCode: null,
      proc
    };
    this.sessions.set(id, session);

    proc.onData((data: string) => this.emitData({ sessionId: id, chunk: data, stream: 'stdout' }));
    proc.onExit(({ exitCode }: { exitCode: number; signal?: number }) => {
      const tracked = this.sessions.get(id);
      if (!tracked) return;
      tracked.endedAt = new Date().toISOString();
      tracked.exitCode = exitCode;
      this.emitExit({ sessionId: id, exitCode, endedAt: tracked.endedAt });
      this.deps.logger.info({ sessionId: id, exitCode }, 'terminal exited');
    });

    this.deps.logger.info(
      { sessionId: id, command, cwd: args.cwd, cols: args.cols, rows: args.rows },
      'terminal started (pty)'
    );
    return detach(session);
  }

  write(sessionId: string, data: string): void {
    const s = this.sessions.get(sessionId);
    if (!s || s.endedAt) return;
    s.proc.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const s = this.sessions.get(sessionId);
    if (!s || s.endedAt) return;
    if (cols <= 0 || rows <= 0) return;
    try { s.proc.resize(cols, rows); } catch { /* ignore */ }
  }

  kill(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    if (!s.endedAt) {
      try { s.proc.kill(); } catch { /* ignore */ }
    }
  }

  remove(sessionId: string): void {
    this.kill(sessionId);
    this.sessions.delete(sessionId);
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.remove(id);
  }

  private isAllowed(command: string): boolean {
    const base = command.replace(/^.*[\\/]/, '').toLowerCase();
    return ALLOWED_COMMANDS.has(base);
  }

  private emitData(evt: TerminalDataEvent): void {
    const win = this.deps.getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(IpcChannels.terminalData, evt);
  }

  private emitExit(evt: TerminalExitEvent): void {
    const win = this.deps.getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(IpcChannels.terminalExit, evt);
  }
}

function detach(s: TrackedSession): TerminalSession {
  const { proc: _proc, ...rest } = s;
  return rest;
}
