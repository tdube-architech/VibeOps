import { readFile, stat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import ignore from 'ignore';
import chokidar, { type FSWatcher } from 'chokidar';
import type { Logger } from 'pino';
import type { BrowserWindow } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';

export interface DiffEvent {
  /** The local terminal session id (term_*). Renderer maps it to ai_session.id. */
  clientLocalId: string;
  filePath: string;
  diffKind: 'create' | 'modify' | 'delete';
  beforeHash: string | null;
  afterHash: string | null;
  sizeBytes: number | null;
  ts: string;
}

interface FileSnap { hash: string; size: number }

interface WatcherEntry {
  watcher: FSWatcher;
  cwd: string;
  /** Snapshot of files at session start. Never mutated — used for diff baseline. */
  baseline: Map<string, FileSnap>;
  /** Last hash we emitted per file. Prevents re-emitting the same modification. */
  lastEmitted: Map<string, string | null>;
  ig: ReturnType<typeof ignore>;
  pending: Map<string, ReturnType<typeof setTimeout>>;
  closed: boolean;
}

const MAX_BASELINE_FILES = 5000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const DEBOUNCE_MS = 500;
const DEFAULT_IGNORES = [
  'node_modules', 'dist', 'build', 'out', 'coverage',
  '.git', '.next', '.turbo', '.cache', '.parcel-cache',
  '.vite', '.svelte-kit', '.nuxt', '.expo', 'target',
  'vendor', '__pycache__', '.venv', 'venv', '.idea', '.vscode'
];

export interface DiffWatcherDeps {
  logger: Logger;
  getMainWindow: () => BrowserWindow | null;
}

export class DiffWatcherService {
  private watchers = new Map<string, WatcherEntry>();

  constructor(private readonly deps: DiffWatcherDeps) {}

  async start(clientLocalId: string, cwd: string): Promise<void> {
    if (this.watchers.has(clientLocalId)) return;
    const ig = await loadIgnore(cwd);
    const baseline = await snapshotRepo(cwd, ig, this.deps.logger);
    this.deps.logger.info(
      { clientLocalId, cwd, baselineFiles: baseline.size },
      'diff watcher baseline'
    );

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

    const entry: WatcherEntry = {
      watcher, cwd, baseline, lastEmitted: new Map(), ig, pending: new Map(), closed: false
    };
    this.watchers.set(clientLocalId, entry);

    const enqueue = (abs: string): void => {
      if (entry.closed) return;
      const rel = path.relative(cwd, abs).replaceAll('\\', '/');
      if (!rel || rel === '.git' || rel.startsWith('.git/')) return;
      if (entry.ig.ignores(rel)) return;
      const existing = entry.pending.get(rel);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        entry.pending.delete(rel);
        void this.processChange(clientLocalId, entry, rel);
      }, DEBOUNCE_MS);
      entry.pending.set(rel, timer);
    };

    watcher.on('error', (err) => {
      this.deps.logger.warn({ clientLocalId, err: (err as Error).message }, 'diff watcher error');
    });
    watcher.on('add', enqueue);
    watcher.on('change', enqueue);
    watcher.on('unlink', enqueue);
  }

  stop(clientLocalId: string): void {
    const entry = this.watchers.get(clientLocalId);
    if (!entry) return;
    entry.closed = true;
    for (const t of entry.pending.values()) clearTimeout(t);
    entry.pending.clear();
    void entry.watcher.close().catch(() => { /* ignore */ });
    this.watchers.delete(clientLocalId);
  }

  stopAll(): void {
    for (const id of [...this.watchers.keys()]) this.stop(id);
  }

  private async processChange(clientLocalId: string, entry: WatcherEntry, rel: string): Promise<void> {
    if (entry.closed) return;
    const abs = path.join(entry.cwd, rel);
    let snap: FileSnap | null = null;
    try {
      const st = await stat(abs);
      if (!st.isFile()) return;
      if (st.size > MAX_FILE_BYTES) {
        snap = { hash: 'too-large', size: st.size };
      } else {
        const buf = await readFile(abs);
        snap = { hash: sha256(buf), size: st.size };
      }
    } catch {
      snap = null; // deleted
    }

    const baselineSnap = entry.baseline.get(rel) ?? null;
    // No diff if file matches baseline (revert restored it, or never changed).
    if (!baselineSnap && !snap) return;
    if (baselineSnap && snap && baselineSnap.hash === snap.hash) {
      // Restored to baseline — clear the last-emitted marker so a future
      // change off baseline emits again.
      entry.lastEmitted.delete(rel);
      return;
    }

    const newHash = snap?.hash ?? null;
    if (entry.lastEmitted.has(rel) && entry.lastEmitted.get(rel) === newHash) return;
    entry.lastEmitted.set(rel, newHash);

    const ev: DiffEvent = {
      clientLocalId,
      filePath: rel,
      diffKind: !baselineSnap && snap ? 'create' : !snap ? 'delete' : 'modify',
      beforeHash: baselineSnap?.hash ?? null,
      afterHash: newHash,
      sizeBytes: snap?.size ?? null,
      ts: new Date().toISOString()
    };

    this.emit(ev);
  }

  private emit(evt: DiffEvent): void {
    const win = this.deps.getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(IpcChannels.aiSessionDiff, evt);
  }
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
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

async function snapshotRepo(
  cwd: string,
  ig: ReturnType<typeof ignore>,
  logger: Logger
): Promise<Map<string, FileSnap>> {
  const out = new Map<string, FileSnap>();
  const stack: string[] = [''];
  while (stack.length > 0 && out.size < MAX_BASELINE_FILES) {
    const rel = stack.pop()!;
    const abs = path.join(cwd, rel);
    let entries;
    try { entries = await readdir(abs, { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      if (out.size >= MAX_BASELINE_FILES) break;
      const childRel = (rel ? rel + '/' : '') + e.name;
      const childRelForIgnore = e.isDirectory() ? childRel + '/' : childRel;
      if (ig.ignores(childRelForIgnore)) continue;
      if (e.isDirectory()) {
        stack.push(childRel);
      } else if (e.isFile()) {
        try {
          const st = await stat(path.join(cwd, childRel));
          if (st.size > MAX_FILE_BYTES) {
            out.set(childRel, { hash: 'too-large', size: st.size });
          } else {
            const buf = await readFile(path.join(cwd, childRel));
            out.set(childRel, { hash: sha256(buf), size: st.size });
          }
        } catch { /* ignore */ }
      }
    }
  }
  if (out.size >= MAX_BASELINE_FILES) {
    logger.warn({ cwd, max: MAX_BASELINE_FILES }, 'diff baseline truncated');
  }
  return out;
}
