import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import ignore from 'ignore';
import chokidar, { type FSWatcher } from 'chokidar';
import type { Logger } from 'pino';
import type { BrowserWindow } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { DirtyFileEvent, CommitEvent } from '@shared/types';
export type { DirtyFileEvent, CommitEvent };

const COMMIT_POLL_MS = 30_000;
const FILE_DEBOUNCE_MS = 400;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_IGNORES = [
  'node_modules', 'dist', 'build', 'out', 'coverage',
  '.git', '.next', '.turbo', '.cache', '.parcel-cache',
  '.vite', '.svelte-kit', '.nuxt', '.expo', 'target',
  'vendor', '__pycache__', '.venv', 'venv', '.idea', '.vscode'
];

interface Entry {
  projectId: string;
  cwd: string;
  watcher: FSWatcher;
  ig: ReturnType<typeof ignore>;
  pending: Map<string, ReturnType<typeof setTimeout>>;
  commitTimer: ReturnType<typeof setInterval>;
  lastSha: string | null;
  closed: boolean;
}

export interface ActivityServiceDeps {
  logger: Logger;
  getMainWindow: () => BrowserWindow | null;
}

function runGit(cwd: string, args: string[], timeoutMs = 8000): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn('git', args, { cwd, windowsHide: true });
    let stdout = '';
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
      resolve(null);
    }, timeoutMs);
    proc.stdout.on('data', (b: Buffer) => { stdout += b.toString('utf8'); });
    proc.on('error', () => { clearTimeout(timer); resolve(null); });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? stdout : null);
    });
  });
}

export class ProjectActivityService {
  private entries = new Map<string, Entry>();

  constructor(private readonly deps: ActivityServiceDeps) {}

  async start(projectId: string, cwd: string): Promise<void> {
    if (this.entries.has(projectId)) return;
    const ig = await loadIgnore(cwd);

    const watcher = chokidar.watch(cwd, {
      ignoreInitial: true,
      persistent: true,
      followSymlinks: false,
      ignored: (p: string) => {
        const rel = path.relative(cwd, p).replaceAll('\\', '/');
        if (!rel) return false;
        if (rel === '.git' || rel.startsWith('.git/')) return true;
        return ig.ignores(rel);
      },
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
    });

    const entry: Entry = {
      projectId, cwd, watcher, ig,
      pending: new Map(),
      commitTimer: setInterval(() => { void this.checkCommits(entry); }, COMMIT_POLL_MS),
      lastSha: null,
      closed: false
    };
    this.entries.set(projectId, entry);

    const queue = (abs: string, deleted: boolean): void => {
      if (entry.closed) return;
      const rel = path.relative(cwd, abs).replaceAll('\\', '/');
      if (!rel || rel === '.git' || rel.startsWith('.git/')) return;
      if (entry.ig.ignores(rel)) return;
      const existing = entry.pending.get(rel);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        entry.pending.delete(rel);
        void this.processFile(entry, rel, deleted);
      }, FILE_DEBOUNCE_MS);
      entry.pending.set(rel, timer);
    };

    watcher.on('add', (p) => queue(p, false));
    watcher.on('change', (p) => queue(p, false));
    watcher.on('unlink', (p) => queue(p, true));
    watcher.on('error', (err) => {
      this.deps.logger.warn({ projectId, err: (err as Error).message }, 'activity watcher error');
    });

    void this.checkCommits(entry);
    this.deps.logger.info({ projectId, cwd }, 'project activity watcher started');
  }

  stop(projectId: string): void {
    const e = this.entries.get(projectId);
    if (!e) return;
    e.closed = true;
    for (const t of e.pending.values()) clearTimeout(t);
    e.pending.clear();
    clearInterval(e.commitTimer);
    void e.watcher.close().catch(() => { /* ignore */ });
    this.entries.delete(projectId);
    this.deps.logger.info({ projectId }, 'project activity watcher stopped');
  }

  stopAll(): void {
    for (const id of [...this.entries.keys()]) this.stop(id);
  }

  private async processFile(entry: Entry, rel: string, deleted: boolean): Promise<void> {
    if (entry.closed) return;
    const abs = path.join(entry.cwd, rel);
    const evt: DirtyFileEvent = {
      projectId: entry.projectId,
      filePath: rel,
      hash: null,
      sizeBytes: null,
      modifiedAt: new Date().toISOString(),
      deleted
    };
    if (!deleted) {
      try {
        const st = await stat(abs);
        if (!st.isFile()) return;
        if (st.size > MAX_FILE_BYTES) {
          evt.hash = 'too-large';
          evt.sizeBytes = st.size;
        } else {
          const buf = await readFile(abs);
          evt.hash = createHash('sha256').update(buf).digest('hex');
          evt.sizeBytes = st.size;
        }
      } catch {
        evt.deleted = true;
      }
    }
    this.emitDirty(evt);
  }

  private async checkCommits(entry: Entry): Promise<void> {
    if (entry.closed) return;
    const headOut = await runGit(entry.cwd, ['rev-parse', 'HEAD']);
    if (!headOut) return;
    const sha = headOut.trim();
    if (!sha || sha === entry.lastSha) {
      entry.lastSha ??= sha;
      return;
    }
    const previous = entry.lastSha;
    entry.lastSha = sha;
    if (!previous) return; // first observation, don't backfill old commits

    const branchOut = await runGit(entry.cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const branch = branchOut?.trim() || null;

    // Walk commits from previous..sha and emit one event per commit.
    const logOut = await runGit(entry.cwd, [
      'log', `${previous}..${sha}`, '--format=%H%x1f%h%x1f%s', '--reverse'
    ]);
    if (!logOut) return;
    for (const line of logOut.split('\n')) {
      if (!line.trim()) continue;
      const [full, short, ...rest] = line.split('\x1f');
      if (!full) continue;
      const evt: CommitEvent = {
        projectId: entry.projectId,
        sha: full,
        shortSha: short ?? full.slice(0, 7),
        message: rest.join('\x1f'),
        branch,
        ts: new Date().toISOString()
      };
      this.emitCommit(evt);
    }
  }

  private emitDirty(evt: DirtyFileEvent): void {
    const win = this.deps.getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(IpcChannels.projectActivityFileDirty, evt);
  }

  private emitCommit(evt: CommitEvent): void {
    const win = this.deps.getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(IpcChannels.projectActivityCommit, evt);
  }
}

async function loadIgnore(cwd: string): Promise<ReturnType<typeof ignore>> {
  const ig = ignore();
  ig.add(DEFAULT_IGNORES);
  try {
    const gi = await readFile(path.join(cwd, '.gitignore'), 'utf8');
    ig.add(gi);
  } catch { /* no .gitignore */ }
  return ig;
}
