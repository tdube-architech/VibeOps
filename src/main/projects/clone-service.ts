import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import { customAlphabet } from 'nanoid';
import type { Logger } from 'pino';
import type { BrowserWindow } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { CloneProgressEvent } from '@shared/types';
export type { CloneProgressEvent };

const GIT_TIMEOUT_MS = 10_000;
const newId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

export interface CloneStartArgs {
  /** Repo URL to clone (https or ssh). */
  repoUrl: string;
  /** Absolute target directory (must not exist or be empty). */
  targetDir: string;
}

export interface CloneStartResult {
  jobId: string;
}

export interface CloneServiceDeps {
  logger: Logger;
  getMainWindow: () => BrowserWindow | null;
}

/** Spawn `git` and resolve with stdout. Times out at GIT_TIMEOUT_MS. */
function runGit(cwd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn('git', args, { cwd, windowsHide: true });
    let stdout = '';
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
      resolve(null);
    }, GIT_TIMEOUT_MS);
    proc.stdout.on('data', (b: Buffer) => { stdout += b.toString('utf8'); });
    proc.on('error', () => { clearTimeout(timer); resolve(null); });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? stdout : null);
    });
  });
}

export class CloneService {
  constructor(private readonly deps: CloneServiceDeps) {}

  async detectRemoteUrl(cwd: string): Promise<string | null> {
    if (!cwd || !fs.existsSync(cwd)) return null;
    const out = await runGit(cwd, ['remote', 'get-url', 'origin']);
    return out ? out.trim() || null : null;
  }

  async detectDefaultBranch(cwd: string): Promise<string | null> {
    if (!cwd || !fs.existsSync(cwd)) return null;
    const out = await runGit(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
    return out ? out.trim().replace(/^origin\//, '') || null : null;
  }

  /**
   * Walk a small set of common code-roots looking for a clone whose origin
   * matches `repoUrl`. Returns the first match.
   */
  async findExistingClone(repoUrl: string, candidates: string[]): Promise<string | null> {
    const normalized = normalizeRepoUrl(repoUrl);
    for (const root of candidates) {
      if (!fs.existsSync(root)) continue;
      let entries;
      try { entries = await fsp.readdir(root, { withFileTypes: true }); }
      catch { continue; }
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const candidate = path.join(root, e.name);
        const remote = await this.detectRemoteUrl(candidate);
        if (remote && normalizeRepoUrl(remote) === normalized) return candidate;
      }
    }
    return null;
  }

  /**
   * Spawn git clone, stream progress as IPC events keyed by jobId.
   * Returns immediately with the jobId; caller subscribes to progress events.
   */
  startClone(args: CloneStartArgs): CloneStartResult {
    const jobId = `clone_${newId()}`;
    void this.runClone(jobId, args);
    return { jobId };
  }

  private async runClone(jobId: string, args: CloneStartArgs): Promise<void> {
    const log = this.deps.logger;
    const target = path.resolve(args.targetDir);

    try {
      await fsp.mkdir(path.dirname(target), { recursive: true });
      if (fs.existsSync(target)) {
        const inside = await fsp.readdir(target).catch(() => []);
        if (inside.length > 0) {
          this.emit({ jobId, line: '', done: true, ok: false,
            error: `Target ${target} already exists and is not empty.` });
          return;
        }
      }

      this.emit({ jobId, line: `Cloning ${args.repoUrl} into ${target}...\n` });

      const proc = spawn('git', ['clone', '--progress', args.repoUrl, target], {
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        windowsHide: true
      });

      const onData = (buf: Buffer): void => {
        const text = buf.toString('utf8');
        for (const line of text.split(/\r?\n|\r/)) {
          if (line) this.emit({ jobId, line: line + '\n' });
        }
      };
      proc.stdout.on('data', onData);
      proc.stderr.on('data', onData);

      proc.on('error', (err) => {
        log.error({ err: err.message }, 'git clone spawn error');
        this.emit({ jobId, line: '', done: true, ok: false, error: err.message });
      });

      proc.on('exit', (code) => {
        const ok = code === 0;
        const evt: CloneProgressEvent = {
          jobId,
          line: ok ? '\nDone.\n' : `\nExited with code ${code}\n`,
          done: true,
          ok,
          exitCode: code
        };
        if (ok) evt.cwd = target;
        else evt.error = `git clone exited ${code}`;
        this.emit(evt);
      });
    } catch (err) {
      this.emit({ jobId, line: '', done: true, ok: false, error: (err as Error).message });
    }
  }

  defaultCodeRoot(): string {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '.';
    return path.join(home, 'Code');
  }

  private emit(evt: CloneProgressEvent): void {
    const win = this.deps.getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(IpcChannels.projectsCloneProgress, evt);
  }
}

/**
 * Normalize repo URLs so https://github.com/foo/bar.git, git@github.com:foo/bar,
 * and https://github.com/foo/bar all compare equal.
 */
export function normalizeRepoUrl(url: string): string {
  let u = url.trim().toLowerCase();
  u = u.replace(/\.git$/, '').replace(/\/+$/, '');
  const sshMatch = /^git@([^:]+):(.+)$/.exec(u);
  if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;
  const httpsMatch = /^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/.exec(u);
  if (httpsMatch) return `${httpsMatch[1]}/${httpsMatch[2]}`;
  return u;
}
