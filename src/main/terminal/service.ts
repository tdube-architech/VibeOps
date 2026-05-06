import { existsSync } from 'node:fs';
import path from 'node:path';
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

/**
 * Walk PATHEXT extensions across PATH dirs to locate a Windows binary by bare
 * name. CreateProcess (used by node-pty's ConPTY backend) won't resolve
 * .cmd / .ps1 shims like claude.cmd or npm.cmd unless given a full path.
 */
function resolveWindowsBinary(command: string, pathEnv: string, cwd: string): string | null {
  if (existsSync(command)) return path.resolve(command);
  const exts = (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').map((e) => e.trim()).filter(Boolean);
  const lowerHasExt = /\.[a-z0-9]+$/i.test(command);
  const candidates = lowerHasExt ? [''] : exts;
  const dirs = [cwd, ...pathEnv.split(';')].filter(Boolean);
  for (const dir of dirs) {
    for (const ext of candidates) {
      const candidate = path.join(dir, command + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
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

    let resolvedCommand = command;
    let resolvedArgs = cmdArgs;
    if (process.platform === 'win32' && !command.includes('\\') && !command.includes('/')) {
      const fullPath = resolveWindowsBinary(command, env.PATH ?? env.Path ?? '', args.cwd);
      if (fullPath) {
        resolvedCommand = fullPath;
      } else {
        // Last resort: let cmd.exe resolve bare names (.cmd / .ps1 shims that
        // CreateProcess won't run directly, e.g. claude.cmd, npm.cmd).
        resolvedCommand = process.env.ComSpec ?? 'cmd.exe';
        resolvedArgs = ['/d', '/s', '/c', command, ...cmdArgs];
      }
    }

    let proc: IPty;
    try {
      proc = pty.spawn(resolvedCommand, resolvedArgs, {
        name: 'xterm-256color',
        cols: args.cols ?? 80,
        rows: args.rows ?? 30,
        cwd: args.cwd,
        env,
        encoding: 'utf8',
        useConpty: process.platform === 'win32',
        useConptyDll: process.platform === 'win32'
      });
    } catch (err) {
      this.deps.logger.error(
        { command, cwd: args.cwd, err: (err as Error).message },
        'pty.spawn failed'
      );
      throw err;
    }

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

    let totalBytes = 0;
    let firstDataAt: number | null = null;
    proc.onData((data: string) => {
      if (firstDataAt === null) {
        firstDataAt = Date.now();
        this.deps.logger.info(
          { sessionId: id, msSinceStart: firstDataAt - Date.parse(startedAt), len: data.length },
          'terminal first data'
        );
      }
      totalBytes += data.length;
      this.emitData({ sessionId: id, chunk: data, stream: 'stdout' });
    });
    proc.onExit(({ exitCode }: { exitCode: number; signal?: number }) => {
      const tracked = this.sessions.get(id);
      if (!tracked) return;
      tracked.endedAt = new Date().toISOString();
      tracked.exitCode = exitCode;
      this.emitExit({ sessionId: id, exitCode, endedAt: tracked.endedAt });
      this.deps.logger.info({ sessionId: id, exitCode, totalBytes }, 'terminal exited');
    });

    // Diagnostic only (logs, not user-visible): report PTY stats 1s after spawn
    // so we can tell from logs whether the PTY produced any output.
    setTimeout(() => {
      this.deps.logger.info(
        { sessionId: id, totalBytes, pid: proc.pid, processName: proc.process },
        'terminal 1s stats'
      );
    }, 1000);

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
