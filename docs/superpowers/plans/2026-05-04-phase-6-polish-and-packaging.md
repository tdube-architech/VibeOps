# VibeOps Phase 6: Polish and Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the working app from Phase 5 to a shippable Windows installer. Add app icon and branding, structured error/loading states across all flows, an auto-update placeholder, in-app data management (export/import DB, clear audits, reset), the dashboard widgets that aggregate across all projects, and end-to-end manual testing on five reference project archetypes.

**Architecture:** No new architectural layers. We harden the existing surfaces:
- Add an `ErrorBoundary` and a `Toast` system in the renderer.
- Add a `BackupService` in main process (DB copy + restore via `dialog.showSaveDialog`/`showOpenDialog`).
- Wire `electron-updater` with a config that does not auto-publish but is ready to be flipped on later.
- Build proper `.ico` and Windows installer assets.
- Add an `App Logs` viewer (read-only) for debugging.

**Tech Stack:** `electron-updater`, `sonner` (lightweight toast). All other deps already installed.

**Reference docs:** PRD §17 (Dashboard), §29.6, §32 (Testing), §33 (Packaging), §34 (Success metrics), §36 (Final MVP definition).

**Prerequisites:** Phase 5 plan complete. `phase-5` git tag exists.

---

## File Structure

```
build/
├── icon.ico                                   # NEW — real Windows icon (256x256 + multi-res)
├── icon.png                                   # NEW — 512x512 source
└── installer-banner.bmp                       # NEW (optional)

src/
├── main/
│   ├── index.ts                               # MODIFY — wire updater + backup
│   ├── update/
│   │   └── updater.ts                         # NEW — electron-updater wrapper
│   ├── backup/
│   │   ├── service.ts                         # NEW
│   │   └── handlers.ts                        # NEW
│   ├── logs/
│   │   └── tail.ts                            # NEW — recent log lines
│   └── ipc/
│       ├── handlers.ts                        # MODIFY
│       └── data-handlers.ts                   # NEW — export/import/reset/logs
├── shared/
│   ├── ipc-channels.ts                        # MODIFY
│   └── types.ts                               # MODIFY — UpdateInfo, BackupResult
├── preload/api.ts                              # MODIFY
└── renderer/
    ├── components/
    │   ├── ErrorBoundary.tsx                  # NEW
    │   ├── EmptyState.tsx                     # NEW
    │   └── ui/
    │       └── toaster.tsx                    # NEW
    ├── lib/
    │   └── toast.ts                           # NEW
    ├── routes/
    │   ├── DashboardRoute.tsx                 # MODIFY — full dashboard widgets
    │   └── SettingsRoute.tsx                  # MODIFY — Data + Update sections
    ├── features/
    │   ├── data/
    │   │   ├── useData.ts                     # NEW
    │   │   ├── DataManagementCard.tsx         # NEW
    │   │   └── LogsViewerCard.tsx             # NEW
    │   ├── update/
    │   │   ├── useUpdate.ts                   # NEW
    │   │   └── UpdateCard.tsx                 # NEW
    │   └── dashboard/
    │       ├── useDashboard.ts                # NEW — aggregates across projects
    │       ├── StatCards.tsx                  # NEW
    │       ├── RecentFindingsPanel.tsx        # NEW
    │       └── HighestRiskPanel.tsx           # NEW
    └── main.tsx                                # MODIFY — Toaster + ErrorBoundary

docs/
├── README.md                                   # MODIFY — install + first run
└── docs/
    ├── architecture.md                         # NEW
    ├── deployment.md                           # NEW
    ├── audit-history.md                        # NEW
    └── roadmap.md                              # NEW

tests/
└── main/
    └── backup-service.test.ts                  # NEW
```

---

## Task 1: App icon + branding assets

**Files:**
- Create: `E:\Projects\VibeOps\build\icon.png` (512x512 source)
- Create: `E:\Projects\VibeOps\build\icon.ico` (multi-res Windows icon)

- [ ] **Step 1: Drop icon source**

The user (or designer) provides a 512x512 PNG at `build/icon.png`. Until they do, generate a simple placeholder:

Run from PowerShell (one-shot):
```powershell
$bytes = [System.IO.File]::ReadAllBytes("$env:LOCALAPPDATA\Programs\@vscode\code\resources\app\out\vs\workbench\contrib\extensions\browser\media\theme-icon.png")
# If that path doesn't exist, ask user for an image. Skip for now.
```

If no real asset is available, leave `build/icon.png` as a 512x512 solid-color PNG — any `.png` will do for first installer. Document the requirement to replace it.

- [ ] **Step 2: Convert PNG → ICO**

Run: `pnpm dlx png-to-ico build/icon.png > build/icon.ico`
Expected: `build/icon.ico` written.

If `png-to-ico` is unavailable, create a manual ico via any online or local converter; the file just needs to exist before packaging.

- [ ] **Step 3: Update `electron-builder.yml` if needed**

Verify the path in `electron-builder.yml` (set in Phase 0 Task 13) matches: `icon: build/icon.ico`. No change usually needed.

- [ ] **Step 4: Commit**

```bash
git add build/icon.png build/icon.ico
git commit -m "chore(branding): app icon assets"
```

---

## Task 2: Add `electron-updater` placeholder

**Files:**
- Create: `E:\Projects\VibeOps\src\main\update\updater.ts`
- Modify: `E:\Projects\VibeOps\src\main\index.ts`

- [ ] **Step 1: Write `src/main/update/updater.ts`**

```ts
import { autoUpdater } from 'electron-updater';
import type { Logger } from 'pino';
import { BrowserWindow, app } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';

export interface UpdaterDeps {
  logger: Logger;
  getMainWindow: () => BrowserWindow | null;
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  latestVersion: string | null;
  message: string | null;
  progressPercent: number | null;
}

let state: UpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  latestVersion: null,
  message: null,
  progressPercent: null
};

function emit(deps: UpdaterDeps): void {
  const win = deps.getMainWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(IpcChannels.updateState, state);
}

export function setupUpdater(deps: UpdaterDeps): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (m) => deps.logger.info({ updater: true }, String(m)),
    warn: (m) => deps.logger.warn({ updater: true }, String(m)),
    error: (m) => deps.logger.error({ updater: true }, String(m)),
    debug: (m) => deps.logger.debug({ updater: true }, String(m))
  } as never;

  autoUpdater.on('checking-for-update', () => {
    state = { ...state, status: 'checking', message: 'Checking for update…' };
    emit(deps);
  });
  autoUpdater.on('update-available', (info) => {
    state = { ...state, status: 'available', latestVersion: info.version, message: `Update ${info.version} available.` };
    emit(deps);
  });
  autoUpdater.on('update-not-available', (info) => {
    state = { ...state, status: 'not-available', latestVersion: info.version, message: 'You are on the latest version.' };
    emit(deps);
  });
  autoUpdater.on('error', (err) => {
    state = { ...state, status: 'error', message: err.message };
    emit(deps);
  });
  autoUpdater.on('download-progress', (p) => {
    state = { ...state, status: 'downloading', progressPercent: Math.round(p.percent) };
    emit(deps);
  });
  autoUpdater.on('update-downloaded', (info) => {
    state = { ...state, status: 'downloaded', latestVersion: info.version, message: 'Update downloaded. Restart to install.' };
    emit(deps);
  });
}

export const updaterApi = {
  state: (): UpdateState => state,
  async check(): Promise<UpdateState> {
    try { await autoUpdater.checkForUpdates(); } catch (err) {
      state = { ...state, status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
    return state;
  },
  async download(): Promise<UpdateState> {
    try { await autoUpdater.downloadUpdate(); } catch (err) {
      state = { ...state, status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
    return state;
  },
  installAndRestart(): void {
    autoUpdater.quitAndInstall();
  }
};
```

- [ ] **Step 2: Wire in `src/main/index.ts`**

Add import:

```ts
import { setupUpdater } from './update/updater';
```

Inside `bootstrap()` (after `mainWindow = createMainWindow();`), add:

```ts
  setupUpdater({ logger: log, getMainWindow: () => mainWindow });
```

- [ ] **Step 3: Add IPC channels** (Task 4 also adds these — keep this step minimal: only wire the listener side here.)

- [ ] **Step 4: Commit**

```bash
git add src/main/update src/main/index.ts
git commit -m "feat(updater): electron-updater wiring with state events"
```

---

## Task 3: Backup service (export/import DB) + tail logs

**Files:**
- Create: `E:\Projects\VibeOps\src\main\backup\service.ts`
- Create: `E:\Projects\VibeOps\src\main\logs\tail.ts`
- Create: `E:\Projects\VibeOps\tests\main\backup-service.test.ts`

- [ ] **Step 1: Failing test**

`tests/main/backup-service.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { BackupService } from '@main/backup/service';

let workdir: string;

beforeEach(() => { workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-bk-')); });
afterEach(() => fs.rmSync(workdir, { recursive: true, force: true }));

describe('BackupService.exportDb / importDb', () => {
  it('copies the DB file to a destination', async () => {
    const dbFile = path.join(workdir, 'vibeops.db');
    fs.writeFileSync(dbFile, 'SQLITEDATA');
    const dest = path.join(workdir, 'export.db');
    const svc = new BackupService({ dbFile });
    const result = await svc.exportDb(dest);
    expect(result.bytesCopied).toBeGreaterThan(0);
    expect(fs.readFileSync(dest, 'utf8')).toBe('SQLITEDATA');
  });

  it('importDb rejects non-sqlite files based on header check', async () => {
    const dbFile = path.join(workdir, 'vibeops.db');
    fs.writeFileSync(dbFile, 'old');
    const bad = path.join(workdir, 'bad.txt');
    fs.writeFileSync(bad, 'not sqlite');
    const svc = new BackupService({ dbFile });
    await expect(svc.importDb(bad)).rejects.toThrow(/sqlite/i);
  });

  it('importDb accepts a valid sqlite header', async () => {
    const dbFile = path.join(workdir, 'vibeops.db');
    fs.writeFileSync(dbFile, 'old');
    const goodSrc = path.join(workdir, 'src.db');
    const header = Buffer.from('SQLite format 3 ', 'ascii');
    fs.writeFileSync(goodSrc, Buffer.concat([header, Buffer.from('rest')]));
    const svc = new BackupService({ dbFile });
    const result = await svc.importDb(goodSrc);
    expect(result.bytesCopied).toBeGreaterThan(0);
    expect(fs.readFileSync(dbFile)).toEqual(fs.readFileSync(goodSrc));
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `pnpm test -- tests/main/backup-service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/main/backup/service.ts`**

```ts
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

export interface BackupServiceDeps {
  dbFile: string;
}

export interface BackupResult {
  destination: string;
  bytesCopied: number;
}

const SQLITE_HEADER = Buffer.from('SQLite format 3 ', 'ascii');

export class BackupService {
  constructor(private readonly deps: BackupServiceDeps) {}

  async exportDb(destination: string): Promise<BackupResult> {
    const dir = path.dirname(destination);
    await fs.mkdir(dir, { recursive: true });
    const stats = await fs.stat(this.deps.dbFile);
    await fs.copyFile(this.deps.dbFile, destination);
    return { destination, bytesCopied: stats.size };
  }

  async importDb(source: string): Promise<BackupResult> {
    const stats = await fs.stat(source);
    if (stats.size < SQLITE_HEADER.length) {
      throw new Error('Source file is too small to be a SQLite database.');
    }
    const fh = await fs.open(source, 'r');
    try {
      const buf = Buffer.alloc(SQLITE_HEADER.length);
      await fh.read(buf, 0, SQLITE_HEADER.length, 0);
      if (!buf.equals(SQLITE_HEADER)) {
        throw new Error('File is not a SQLite database (header mismatch).');
      }
    } finally {
      await fh.close();
    }
    const backup = `${this.deps.dbFile}.before-import.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
    if (fsSync.existsSync(this.deps.dbFile)) {
      await fs.copyFile(this.deps.dbFile, backup);
    }
    await fs.copyFile(source, this.deps.dbFile);
    return { destination: this.deps.dbFile, bytesCopied: stats.size };
  }
}
```

- [ ] **Step 4: Run test**

Run: `pnpm test -- tests/main/backup-service.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Write `src/main/logs/tail.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';

export function tailLogFile(logsDir: string, filename = 'app.log', maxLines = 200): string[] {
  const file = path.join(logsDir, filename);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.slice(Math.max(0, lines.length - maxLines));
}
```

- [ ] **Step 6: Commit**

```bash
git add src/main/backup src/main/logs tests/main/backup-service.test.ts
git commit -m "feat(backup): export/import DB with SQLite header validation; tail logs"
```

---

## Task 4: IPC channels + handlers for data + update

**Files:**
- Modify: `E:\Projects\VibeOps\src\shared\ipc-channels.ts`
- Modify: `E:\Projects\VibeOps\src\shared\types.ts`
- Create: `E:\Projects\VibeOps\src\main\ipc\data-handlers.ts`
- Modify: `E:\Projects\VibeOps\src\main\ipc\handlers.ts`
- Modify: `E:\Projects\VibeOps\src\main\index.ts`

- [ ] **Step 1: Add types**

Append to `src/shared/types.ts`:

```ts
export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  latestVersion: string | null;
  message: string | null;
  progressPercent: number | null;
}

export interface BackupExportResult {
  destination: string;
  bytesCopied: number;
}

export interface DashboardSummary {
  totals: {
    projects: number;
    archived: number;
    needsAudit: number;
    memoryCurrent: number;
    criticalFindings: number;
  };
  highestRiskProject: { id: string; name: string; score: number } | null;
  recentFindings: Array<{
    auditRunId: string;
    projectId: string;
    projectName: string;
    title: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    createdAt: string;
  }>;
}
```

- [ ] **Step 2: Add channels**

Append in `src/shared/ipc-channels.ts`:

```ts
,
  dataExportDb: 'data:exportDb',
  dataImportDb: 'data:importDb',
  dataResetApp: 'data:resetApp',
  dataClearAuditHistory: 'data:clearAuditHistory',
  dataTailLogs: 'data:tailLogs',
  dashboardSummary: 'data:dashboardSummary',

  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateState: 'update:state'
```

- [ ] **Step 3: Verify channels test**

Run: `pnpm test -- tests/shared/ipc-channels.test.ts`
Expected: 4 tests pass.

- [ ] **Step 4: Write `src/main/ipc/data-handlers.ts`**

```ts
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import type { Logger } from 'pino';
import { sql } from 'drizzle-orm';
import { IpcChannels } from '@shared/ipc-channels';
import type { BackupExportResult, DashboardSummary } from '@shared/types';
import type { BackupService } from '@main/backup/service';
import type { Db, DbHandle } from '@main/db/client';
import { tailLogFile } from '@main/logs/tail';
import type { ProjectsService } from '@main/projects/service';
import type { AuditsRepo } from '@main/audit/repo';

interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export interface DataContext {
  backup: BackupService;
  db: Db;
  dbHandle: DbHandle;
  appDataRoot: string;
  logsDir: string;
  logger: Logger;
  getMainWindow: () => BrowserWindow | null;
  projectsService: ProjectsService;
  auditsRepo: AuditsRepo;
}

export function registerDataHandlers(ctx: DataContext): void {
  ipcMain.handle(IpcChannels.dataExportDb, async (): Promise<Result<BackupExportResult>> => {
    try {
      const win = ctx.getMainWindow();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const result = win
        ? await dialog.showSaveDialog(win, {
            defaultPath: path.join(app.getPath('documents'), `vibeops-backup-${stamp}.db`),
            filters: [{ name: 'VibeOps DB', extensions: ['db'] }]
          })
        : await dialog.showSaveDialog({ defaultPath: `vibeops-backup-${stamp}.db` });
      if (result.canceled || !result.filePath) {
        return fail(new Error('Export canceled.'));
      }
      const r = await ctx.backup.exportDb(result.filePath);
      return ok(r);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.dataImportDb, async (): Promise<Result<BackupExportResult>> => {
    try {
      const win = ctx.getMainWindow();
      const result = win
        ? await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'VibeOps DB', extensions: ['db'] }] })
        : await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'VibeOps DB', extensions: ['db'] }] });
      if (result.canceled || result.filePaths.length === 0) {
        return fail(new Error('Import canceled.'));
      }
      const file = result.filePaths[0]!;
      // We need to close the DB before swapping the file, then quit so main re-opens on next launch.
      ctx.dbHandle.close();
      const r = await ctx.backup.importDb(file);
      ctx.logger.warn({ source: file }, 'database imported; restart required');
      return ok(r);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.dataClearAuditHistory, (): Result<true> => {
    try {
      ctx.db.run(sql`DELETE FROM audit_findings`);
      ctx.db.run(sql`DELETE FROM audit_runs`);
      ctx.db.run(sql`DELETE FROM generated_prompts`);
      return ok(true);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.dataResetApp, async (): Promise<Result<true>> => {
    try {
      ctx.dbHandle.close();
      const dbFile = path.join(ctx.appDataRoot, 'vibeops.db');
      const settingsFile = path.join(ctx.appDataRoot, 'settings.json');
      const secretsFile = path.join(ctx.appDataRoot, 'secrets.json');
      for (const file of [dbFile, settingsFile, secretsFile]) {
        try { fs.unlinkSync(file); } catch { /* ignore */ }
      }
      app.relaunch();
      app.exit(0);
      return ok(true);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.dataTailLogs, (_e, count: number = 200): Result<string[]> => {
    try { return ok(tailLogFile(ctx.logsDir, 'app.log', count)); }
    catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.dashboardSummary, (): Result<DashboardSummary> => {
    try {
      const projects = ctx.projectsService.list({ includeArchived: true });
      const active = projects.filter((p) => p.status !== 'archived');
      let highestRisk: DashboardSummary['highestRiskProject'] = null;
      let criticalFindings = 0;
      const recent: DashboardSummary['recentFindings'] = [];
      let needsAudit = 0;
      let memoryCurrent = 0;

      for (const p of active) {
        const latest = ctx.auditsRepo.latestForProject(p.id);
        if (!latest) {
          needsAudit++;
          continue;
        }
        if (latest.score !== null && (highestRisk === null || latest.score < highestRisk.score)) {
          highestRisk = { id: p.id, name: p.name, score: latest.score };
        }
        const crits = latest.findings.filter((f) => f.severity === 'critical').length;
        criticalFindings += crits;

        for (const f of latest.findings) {
          if (f.severity === 'critical' || f.severity === 'high') {
            recent.push({
              auditRunId: latest.id,
              projectId: p.id,
              projectName: p.name,
              title: f.title,
              severity: f.severity,
              createdAt: f.createdAt
            });
          }
        }
        // Memory currency heuristic: scan was done after last audit.
        if (p.lastScannedAt && latest.completedAt && p.lastScannedAt >= latest.completedAt) memoryCurrent++;
      }

      recent.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return ok({
        totals: {
          projects: active.length,
          archived: projects.length - active.length,
          needsAudit,
          memoryCurrent,
          criticalFindings
        },
        highestRiskProject: highestRisk,
        recentFindings: recent.slice(0, 20)
      });
    } catch (e) { return fail(e); }
  });
}

export function registerUpdateHandlers(updaterApi: {
  state: () => unknown;
  check: () => Promise<unknown>;
  download: () => Promise<unknown>;
  installAndRestart: () => void;
}): void {
  ipcMain.handle(IpcChannels.updateCheck, async () => {
    try { return ok(await updaterApi.check()); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.updateDownload, async () => {
    try { return ok(await updaterApi.download()); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.updateInstall, () => {
    try { updaterApi.installAndRestart(); return ok(true); } catch (e) { return fail(e); }
  });
}
```

- [ ] **Step 5: Re-export from `handlers.ts`**

Append:

```ts
export { registerDataHandlers, registerUpdateHandlers } from './data-handlers';
```

- [ ] **Step 6: Wire into `src/main/index.ts`**

Add imports:

```ts
import { BackupService } from './backup/service';
import { registerDataHandlers, registerUpdateHandlers } from './ipc/handlers';
import { updaterApi } from './update/updater';
```

Inside `bootstrap()`, after `const auditsRepo = new AuditsRepo(handle.db);`, add:

```ts
  const backup = new BackupService({ dbFile: paths.dbFile });
```

After the `registerAuditHandlers({...})` block, add:

```ts
  registerDataHandlers({
    backup, db: handle.db, dbHandle: handle,
    appDataRoot: paths.root, logsDir: paths.logsDir,
    logger: log, getMainWindow: () => mainWindow,
    projectsService, auditsRepo
  });
  registerUpdateHandlers(updaterApi);
```

- [ ] **Step 7: Tests + typecheck**

Run: `pnpm build:typecheck && pnpm test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/shared/ipc-channels.ts src/main/ipc/data-handlers.ts src/main/ipc/handlers.ts src/main/index.ts
git commit -m "feat(ipc): data + update handlers; dashboard summary aggregator"
```

---

## Task 5: Preload exposes data, update, dashboard namespaces

**Files:**
- Modify: `E:\Projects\VibeOps\src\preload\api.ts`

- [ ] **Step 1: Extend api**

Add types import:

```ts
import type { BackupExportResult, DashboardSummary, UpdateState } from '@shared/types';
```

Inside `api`:

```ts
  data: {
    exportDb: (): Promise<BackupExportResult> => unwrap(ipcRenderer.invoke(IpcChannels.dataExportDb)),
    importDb: (): Promise<BackupExportResult> => unwrap(ipcRenderer.invoke(IpcChannels.dataImportDb)),
    clearAuditHistory: (): Promise<true> => unwrap(ipcRenderer.invoke(IpcChannels.dataClearAuditHistory)),
    resetApp: (): Promise<true> => unwrap(ipcRenderer.invoke(IpcChannels.dataResetApp)),
    tailLogs: (count?: number): Promise<string[]> => unwrap(ipcRenderer.invoke(IpcChannels.dataTailLogs, count ?? 200)),
    dashboardSummary: (): Promise<DashboardSummary> => unwrap(ipcRenderer.invoke(IpcChannels.dashboardSummary))
  },
  update: {
    check: (): Promise<UpdateState> => unwrap(ipcRenderer.invoke(IpcChannels.updateCheck)),
    download: (): Promise<UpdateState> => unwrap(ipcRenderer.invoke(IpcChannels.updateDownload)),
    install: (): Promise<true> => unwrap(ipcRenderer.invoke(IpcChannels.updateInstall)),
    onState: (cb: (s: UpdateState) => void): (() => void) => {
      const handler = (_e: unknown, s: UpdateState) => cb(s);
      ipcRenderer.on(IpcChannels.updateState, handler);
      return () => ipcRenderer.removeListener(IpcChannels.updateState, handler);
    }
  }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build:typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/preload/api.ts
git commit -m "feat(preload): data, update, dashboard namespaces"
```

---

## Task 6: Toast system + ErrorBoundary + EmptyState

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\components\ui\toaster.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\lib\toast.ts`
- Create: `E:\Projects\VibeOps\src\renderer\components\ErrorBoundary.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\components\EmptyState.tsx`
- Modify: `E:\Projects\VibeOps\src\renderer\main.tsx`

- [ ] **Step 1: Add toast dep**

Run: `pnpm add sonner`

- [ ] **Step 2: Write `toaster.tsx`**

```tsx
import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return <SonnerToaster theme="dark" position="bottom-right" richColors />;
}
```

- [ ] **Step 3: Write `toast.ts`**

```ts
import { toast as sonner } from 'sonner';

export const toast = {
  success: (msg: string, description?: string) => sonner.success(msg, { description }),
  error: (msg: string, description?: string) => sonner.error(msg, { description }),
  info: (msg: string, description?: string) => sonner.message(msg, { description })
};
```

- [ ] **Step 4: Write `ErrorBoundary.tsx`**

```tsx
import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Props { children: React.ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Render error:', error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-6">
        <Card>
          <CardHeader><CardTitle>Something went wrong</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <pre className="rounded-md border border-border bg-card/40 p-3 text-xs">{this.state.error.message}</pre>
            <Button onClick={() => this.setState({ error: null })}>Try again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }
}
```

- [ ] **Step 5: Write `EmptyState.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

interface Props {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div className={cn('rounded-md border border-dashed border-border bg-card/30 p-8 text-center', className)}>
      {icon && <div className="mb-3 flex justify-center text-muted-foreground">{icon}</div>}
      <div className="text-sm font-medium">{title}</div>
      {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 6: Wrap app in `src/renderer/main.tsx`**

Replace contents:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from './components/ui/toaster';
import './index.css';

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } });

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={qc}>
        <App />
        <Toaster />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components src/renderer/lib/toast.ts src/renderer/main.tsx package.json pnpm-lock.yaml
git commit -m "feat(renderer): toast system, ErrorBoundary, EmptyState"
```

---

## Task 7: Dashboard widgets (aggregate cross-project)

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\features\dashboard\useDashboard.ts`
- Create: `E:\Projects\VibeOps\src\renderer\features\dashboard\StatCards.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\features\dashboard\RecentFindingsPanel.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\features\dashboard\HighestRiskPanel.tsx`
- Modify: `E:\Projects\VibeOps\src\renderer\routes\DashboardRoute.tsx`

- [ ] **Step 1: Write `useDashboard.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api.data.dashboardSummary(),
    staleTime: 15_000
  });
}
```

- [ ] **Step 2: Write `StatCards.tsx`**

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardSummary } from '@shared/types';

export function StatCards({ summary }: { summary: DashboardSummary | undefined }) {
  const totals = summary?.totals;
  const tiles = [
    { label: 'Total Projects', value: totals?.projects ?? '—' },
    { label: 'Needs Audit', value: totals?.needsAudit ?? '—' },
    { label: 'Critical Findings', value: totals?.criticalFindings ?? '—' },
    { label: 'Memory Current', value: totals?.memoryCurrent ?? '—' }
  ];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardHeader className="pb-2">
            <CardDescription>{t.label}</CardDescription>
            <CardTitle className="text-3xl">{t.value}</CardTitle>
          </CardHeader>
          <CardContent />
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write `RecentFindingsPanel.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DashboardSummary } from '@shared/types';

export function RecentFindingsPanel({ summary }: { summary: DashboardSummary | undefined }) {
  const findings = summary?.recentFindings ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Critical/High Findings</CardTitle>
        <CardDescription>Top 20 across all active projects.</CardDescription>
      </CardHeader>
      <CardContent>
        {findings.length === 0 ? (
          <div className="text-sm text-muted-foreground">No critical or high findings yet.</div>
        ) : (
          <div className="space-y-1">
            {findings.map((f) => (
              <Link
                key={`${f.auditRunId}-${f.title}`}
                to={`/projects/${f.projectId}`}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:bg-secondary/40"
              >
                <div>
                  <div className="font-medium text-sm">{f.title}</div>
                  <div className="text-xs text-muted-foreground">{f.projectName}</div>
                </div>
                <Badge variant={f.severity === 'critical' ? 'destructive' : 'warning'}>{f.severity}</Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Write `HighestRiskPanel.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuditScoreRing } from '@/features/projects/AuditScoreRing';
import { riskLabelFromScore } from '@/lib/risk';
import type { DashboardSummary } from '@shared/types';

export function HighestRiskPanel({ summary }: { summary: DashboardSummary | undefined }) {
  const target = summary?.highestRiskProject;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Highest Risk Project</CardTitle>
        <CardDescription>Lowest-scoring active project from latest audits.</CardDescription>
      </CardHeader>
      <CardContent>
        {!target ? (
          <div className="text-sm text-muted-foreground">No audits yet.</div>
        ) : (
          <Link to={`/projects/${target.id}`} className="flex items-center gap-4 rounded-md border border-border p-3 hover:bg-secondary/40">
            <AuditScoreRing score={target.score} risk={riskLabelFromScore(target.score)} />
            <div>
              <div className="font-medium">{target.name}</div>
              <div className="text-xs text-muted-foreground">Click to open project</div>
            </div>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Write `src/renderer/lib/risk.ts`**

```ts
import type { RiskLevel } from '@shared/types';

export function riskLabelFromScore(score: number): RiskLevel {
  if (score >= 90) return 'Strong';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Needs Work';
  if (score >= 40) return 'Risky';
  return 'Critical';
}
```

- [ ] **Step 6: Replace `DashboardRoute.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AddProjectButton } from '@/features/projects/AddProjectButton';
import { ProjectTable } from '@/features/projects/ProjectTable';
import { StatCards } from '@/features/dashboard/StatCards';
import { RecentFindingsPanel } from '@/features/dashboard/RecentFindingsPanel';
import { HighestRiskPanel } from '@/features/dashboard/HighestRiskPanel';
import { useDashboardSummary } from '@/features/dashboard/useDashboard';

export function DashboardRoute() {
  const { data: summary, isLoading } = useDashboardSummary();
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">High-level view of all VibeOps projects.</p>
        </div>
        <AddProjectButton />
      </div>
      <StatCards summary={summary} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Project Workspace</CardTitle></CardHeader>
            <CardContent><ProjectTable /></CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <HighestRiskPanel summary={summary} />
          <RecentFindingsPanel summary={summary} />
        </div>
      </div>
      {isLoading && <div className="text-xs text-muted-foreground">Loading dashboard…</div>}
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/features/dashboard src/renderer/lib/risk.ts src/renderer/routes/DashboardRoute.tsx
git commit -m "feat(dashboard): cross-project widgets — stats, highest risk, recent findings"
```

---

## Task 8: Settings — Data Management + Update sections

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\features\data\useData.ts`
- Create: `E:\Projects\VibeOps\src\renderer\features\data\DataManagementCard.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\features\data\LogsViewerCard.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\features\update\useUpdate.ts`
- Create: `E:\Projects\VibeOps\src\renderer\features\update\UpdateCard.tsx`
- Modify: `E:\Projects\VibeOps\src\renderer\routes\SettingsRoute.tsx`

- [ ] **Step 1: Write `useData.ts`**

```ts
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useExportDb() {
  return useMutation({ mutationFn: () => api.data.exportDb() });
}
export function useImportDb() {
  return useMutation({ mutationFn: () => api.data.importDb() });
}
export function useClearAuditHistory() {
  return useMutation({ mutationFn: () => api.data.clearAuditHistory() });
}
export function useResetApp() {
  return useMutation({ mutationFn: () => api.data.resetApp() });
}
export function useLogs(count = 200) {
  return useQuery({ queryKey: ['logs', count], queryFn: () => api.data.tailLogs(count), refetchOnWindowFocus: false });
}
```

- [ ] **Step 2: Write `DataManagementCard.tsx`**

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Upload, Trash2, RotateCcw } from 'lucide-react';
import { useExportDb, useImportDb, useClearAuditHistory, useResetApp } from './useData';
import { toast } from '@/lib/toast';

export function DataManagementCard() {
  const exp = useExportDb();
  const imp = useImportDb();
  const clearAudit = useClearAuditHistory();
  const reset = useResetApp();

  async function onExport() {
    try { const r = await exp.mutateAsync(); toast.success('Database exported', `${r.bytesCopied} bytes → ${r.destination}`); }
    catch (e) { toast.error('Export failed', (e as Error).message); }
  }
  async function onImport() {
    if (!window.confirm('Import will replace the current database. A timestamped backup will be created. Continue?')) return;
    try { await imp.mutateAsync(); toast.info('Database imported', 'Restart the app to load it.'); }
    catch (e) { toast.error('Import failed', (e as Error).message); }
  }
  async function onClearAudits() {
    if (!window.confirm('Delete ALL audit runs and findings? Projects and scans are preserved. This cannot be undone.')) return;
    try { await clearAudit.mutateAsync(); toast.success('Audit history cleared'); }
    catch (e) { toast.error('Clear failed', (e as Error).message); }
  }
  async function onReset() {
    if (!window.confirm('This will delete all VibeOps data: projects, scans, memories, audits, settings, and API keys. This cannot be undone. Continue?')) return;
    try { await reset.mutateAsync(); }
    catch (e) { toast.error('Reset failed', (e as Error).message); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Management</CardTitle>
        <CardDescription>Local-only operations on the SQLite database.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button variant="outline" onClick={onExport}><Download className="h-4 w-4" /> Export Database</Button>
        <Button variant="outline" onClick={onImport}><Upload className="h-4 w-4" /> Import Database</Button>
        <Button variant="outline" onClick={onClearAudits}><Trash2 className="h-4 w-4" /> Clear Audit History</Button>
        <Button variant="destructive" onClick={onReset}><RotateCcw className="h-4 w-4" /> Reset App</Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Write `LogsViewerCard.tsx`**

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLogs } from './useData';

export function LogsViewerCard() {
  const { data: lines = [], refetch, isFetching } = useLogs(200);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>App Logs</CardTitle>
          <CardDescription>Last 200 lines from %APPDATA%\VibeOps\logs\app.log</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>{isFetching ? 'Refreshing…' : 'Refresh'}</Button>
      </CardHeader>
      <CardContent>
        <pre className="max-h-[300px] overflow-auto rounded-md border border-border bg-card/40 p-3 text-[10px] font-mono leading-relaxed">
{lines.join('\n') || '(no log file yet)'}
        </pre>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Write `useUpdate.ts`**

```ts
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { UpdateState } from '@shared/types';

export function useUpdateState() {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => api.update.onState(setState), []);
  return state;
}

export function useCheckUpdate() {
  return useMutation({ mutationFn: () => api.update.check() });
}
export function useDownloadUpdate() {
  return useMutation({ mutationFn: () => api.update.download() });
}
export function useInstallUpdate() {
  return useMutation({ mutationFn: () => api.update.install() });
}
```

- [ ] **Step 5: Write `UpdateCard.tsx`**

```tsx
import { Download, Power, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUpdateState, useCheckUpdate, useDownloadUpdate, useInstallUpdate } from './useUpdate';

export function UpdateCard() {
  const state = useUpdateState();
  const check = useCheckUpdate();
  const download = useDownloadUpdate();
  const install = useInstallUpdate();
  const status = state?.status ?? 'idle';
  const canDownload = status === 'available';
  const canInstall = status === 'downloaded';

  return (
    <Card>
      <CardHeader>
        <CardTitle>App Updates</CardTitle>
        <CardDescription>
          Current version <Badge variant="outline">{state?.currentVersion ?? '—'}</Badge>
          {state?.latestVersion && <> · Latest <Badge variant="outline">{state.latestVersion}</Badge></>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => check.mutate()} disabled={check.isPending}>
            <RefreshCw className="h-4 w-4" /> Check for Updates
          </Button>
          <Button variant="outline" onClick={() => download.mutate()} disabled={!canDownload || download.isPending}>
            <Download className="h-4 w-4" /> Download
          </Button>
          <Button onClick={() => install.mutate()} disabled={!canInstall}>
            <Power className="h-4 w-4" /> Restart and Install
          </Button>
        </div>
        {state?.message && <div className="text-sm text-muted-foreground">{state.message}</div>}
        {state?.progressPercent !== null && state?.progressPercent !== undefined && state.status === 'downloading' && (
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary" style={{ width: `${state.progressPercent}%` }} />
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          Updates are placeholder-only in MVP — auto-publish is disabled. The infrastructure is wired so a future release can flip `autoUpdater.checkForUpdates()` on at startup.
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Update SettingsRoute**

Replace contents:

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProviderForm } from '@/features/settings/ProviderForm';
import { useSettings } from '@/features/settings/useSettings';
import { DataManagementCard } from '@/features/data/DataManagementCard';
import { LogsViewerCard } from '@/features/data/LogsViewerCard';
import { UpdateCard } from '@/features/update/UpdateCard';
import type { AIProviderId } from '@shared/types';

const PROVIDERS: AIProviderId[] = ['anthropic', 'mock'];

export function SettingsRoute() {
  const { data: settings, isLoading } = useSettings();
  if (isLoading || !settings) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Local configuration. API keys are stored at <code>%APPDATA%\VibeOps\secrets.json</code> and encrypted by Electron safeStorage when available.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI Providers</CardTitle>
          <CardDescription>
            Active provider: <span className="font-medium">{settings.ai.activeProviderId ?? 'none'}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {PROVIDERS.map((id) => <ProviderForm key={id} settings={settings} providerId={id} />)}
        </CardContent>
      </Card>

      <DataManagementCard />
      <UpdateCard />
      <LogsViewerCard />

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>VibeOps is read-only by default. Shell command modes ship in V1.1.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc pl-5 space-y-1">
            <li>Shell command mode: <span className="font-medium">{settings.security.shellCommandMode}</span></li>
            <li>Allow AI cloud calls: <span className="font-medium">{settings.security.allowAiCloudCalls ? 'yes' : 'no'}</span></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/features/data src/renderer/features/update src/renderer/routes/SettingsRoute.tsx
git commit -m "feat(settings): data management, update placeholder, log viewer"
```

---

## Task 9: Empty/loading states across feature tabs

**Files:**
- Modify: `E:\Projects\VibeOps\src\renderer\features\projects\ProjectTable.tsx`
- Modify: `E:\Projects\VibeOps\src\renderer\routes\projects\ProjectScanTab.tsx`
- Modify: `E:\Projects\VibeOps\src\renderer\routes\projects\ProjectMemoryTab.tsx`
- Modify: `E:\Projects\VibeOps\src\renderer\routes\projects\ProjectAuditsTab.tsx`

- [ ] **Step 1: Use `EmptyState` in ProjectTable**

In `ProjectTable.tsx`, replace the `<tr>` "No projects yet." row with a single-cell EmptyState, wrapped in a fragment for table-friendliness. Simpler approach: leave the table row but add a `EmptyState` block above the table when `data.length === 0` and `!isLoading`. Add this just before the `<div className="rounded-md border ...">`:

```tsx
import { FolderKanban } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
// ...
{!isLoading && data.length === 0 && search.trim().length === 0 && (
  <EmptyState
    icon={<FolderKanban className="h-8 w-8" />}
    title="No projects registered"
    description="Click Add Project on the Dashboard to register your first local folder."
  />
)}
```

- [ ] **Step 2: Add toast on key mutations**

In `AddProjectButton.tsx`, after successful `addMut.mutateAsync`:

```tsx
import { toast } from '@/lib/toast';
// in submit() right before setOpen(false):
toast.success(`Added ${form.name}`);
```

In `useStartScan` callers — the scan tab — after success:

```tsx
toast.success('Scan complete');
```

In `useStartAudit` callers — the audit tab — after success:

```tsx
toast.success('Audit complete', `Score ${audit.score}/100`);
```

In `useWriteMemoryFile` success path:

```tsx
toast.success('memory.md written');
```

(Use the toast helper consistently. Errors should also call `toast.error` instead of only setting local state.)

- [ ] **Step 3: Standardize loading copy**

Replace any "Loading…" strings with consistent muted-foreground spans of 14px. No functional change.

- [ ] **Step 4: Commit**

```bash
git add src/renderer
git commit -m "feat(ux): empty states, toasts, and consistent loading copy"
```

---

## Task 10: Internal docs site folder

**Files:**
- Create: `E:\Projects\VibeOps\docs\architecture.md`
- Create: `E:\Projects\VibeOps\docs\deployment.md`
- Create: `E:\Projects\VibeOps\docs\audit-history.md`
- Create: `E:\Projects\VibeOps\docs\roadmap.md`
- Modify: `E:\Projects\VibeOps\README.md`

- [ ] **Step 1: Write architecture doc** (concise; mirror PRD §9):

```md
# Architecture

VibeOps runs as an Electron desktop app split into three trust zones:

- **Main process** — owns lifecycle, filesystem access, SQLite, AI calls, and shell access (currently disabled).
- **Preload bridge** — exposes a typed `window.vibeops` API via `contextBridge`. No raw `ipcRenderer`.
- **Renderer** — React 18 + Tailwind + shadcn/ui. No Node, no FS, no shell.

See `vibeops_windows_native_app_prd.md` for full spec. Key folders:

- `src/main/projects` — project registry
- `src/main/scanner`  — read-only project walker + detectors
- `src/main/memory`   — memory.md generator + merger
- `src/main/ai`       — provider registry + secret redactor
- `src/main/audit`    — audit pipeline (static + AI)
- `src/renderer`      — UI
```

- [ ] **Step 2: Write deployment doc**:

```md
# Deployment

Build a Windows installer:

```bash
pnpm install
pnpm build
pnpm package
```

Output: `release/VibeOps Setup <version>.exe`.

App data lives in `%APPDATA%\VibeOps\`:

- `vibeops.db` — SQLite database
- `settings.json` — app settings
- `secrets.json` — encrypted API keys (Electron safeStorage)
- `logs/app.log` — pino log file
- `backups/` — DB exports (when used)
```

- [ ] **Step 3: Write audit-history doc**:

```md
# Audit History

VibeOps stores every audit run in `audit_runs` and every finding in `audit_findings`.
Inspect via the Audits tab on a project, or query directly with `sqlite3 %APPDATA%\VibeOps\vibeops.db`.

Per-project history shows score over time. Cross-project history is available on the Dashboard.
```

- [ ] **Step 4: Write roadmap doc**:

```md
# Roadmap

## V1.1
- Project chat
- Git status detection
- Prompt history with outcome notes
- Task board generated from findings
- Export handoff docs (CLAUDE.md, AGENTS.md, README, docs/*)
- Multi-provider comparison

## V1.2
- Claude Agent SDK integration
- Codex SDK integration
- File-level semantic search
- Cost tracking

## V2
- Background project watching
- Auto-refresh memory after Git commits
- Audit comparison over time
- Generate release notes / handoff reports

## V3
- Optional cloud sync
- Team workspaces
- Hosted dashboard
```

- [ ] **Step 5: Update root README**:

Replace contents:

```md
# VibeOps

Local-first Windows desktop project intelligence app.

## What it does
- Registers local project folders.
- Scans them read-only.
- Detects stack, frameworks, package manager, database, auth, deployment.
- Generates and maintains a `memory.md` for each project.
- Runs read-only audits with severity-graded findings and a recommended Claude/Codex prompt.

## Dev

```bash
pnpm install
pnpm dev
```

## Build a Windows installer

```bash
pnpm package
```

## Docs
- [Architecture](docs/architecture.md)
- [Deployment](docs/deployment.md)
- [Audit history](docs/audit-history.md)
- [Roadmap](docs/roadmap.md)
- Spec: [vibeops_windows_native_app_prd.md](vibeops_windows_native_app_prd.md)
```

- [ ] **Step 6: Commit**

```bash
git add docs/architecture.md docs/deployment.md docs/audit-history.md docs/roadmap.md README.md
git commit -m "docs: architecture, deployment, audit-history, roadmap"
```

---

## Task 11: Ship-readiness checklist + manual testing matrix

**Files:** none (validation step). Run all checks before tagging the MVP release.

- [ ] **Step 1: Run full quality gate**

Run: `pnpm test && pnpm build:typecheck && pnpm build`
Expected: all three exit 0.

- [ ] **Step 2: Build the installer**

Run: `pnpm package`
Expected: `release/VibeOps Setup <version>.exe` written. Note the size — should be under 150 MB for MVP.

- [ ] **Step 3: Install on a fresh Windows account**

Steps:
1. Copy installer to a clean test user profile (or VM).
2. Run installer. Pick custom install dir.
3. Confirm `Start Menu` shortcut and `Desktop` shortcut behave per `nsis` config.
4. Launch app from shortcut. Verify dark UI loads, dashboard renders, version shown in topbar.
5. Confirm `%APPDATA%\VibeOps` directory created with `vibeops.db`, `logs/`.

- [ ] **Step 4: Run the five reference projects through the full flow** (PRD §32.3)

Create one folder per archetype. For each:
- Add to VibeOps via Add Project.
- Run scan; verify detection.
- Generate + save + write memory.md; verify file on disk.
- Run audit; verify findings and score.

Reference projects:

| Archetype | What to verify |
|---|---|
| Next.js + Supabase | Detects Next.js + Supabase Postgres + Supabase Auth + Vercel. |
| React + Vite | Detects Vite + React + Tailwind. |
| Python FastAPI | Detects FastAPI + pip/poetry. |
| Electron app | Detects Electron + frameworks; doesn't recurse into out/release. |
| React Native / Expo | Detects Expo + React Native. |

- [ ] **Step 5: Privacy + security spot checks**

- DevTools console: zero CSP violations, zero `nodeIntegration` warnings.
- Open `%APPDATA%\VibeOps\settings.json`: contains no plaintext API key.
- Open `%APPDATA%\VibeOps\secrets.json`: keys prefixed `safe:` (or `unsafe:` only when safeStorage unavailable).
- Open `vibeops.db` and grep for raw `.env` value strings — none should appear.

- [ ] **Step 6: Performance budgets** (PRD §34.2)

- Time-to-add-project: under 30 seconds.
- Scan time on a medium project (~5k files): under 2 minutes.
- Dashboard load: under 2 seconds with 20 registered projects.

- [ ] **Step 7: Tag MVP**

```bash
git tag -a v0.1.0 -m "VibeOps MVP — Phase 6 complete"
```

- [ ] **Step 8: Optional — push the tag and installer artifact**

If you have a remote, run:

```bash
git push --tags
```

Upload the installer to your distribution channel manually. Auto-publish stays off in MVP.

- [ ] **Step 9: Commit any remaining cleanup**

```bash
git status
# if anything dirty:
git add -A
git commit -m "chore: ship-readiness cleanup for v0.1.0"
```

---

## Self-Review Notes

- **Spec coverage (PRD §29.6 packaging):** Windows installer ✓, app shortcut ✓, app icon ✓ (placeholder shipped, real asset can swap in), local data folder ✓, uninstall via NSIS ✓.
- **Spec coverage (PRD §17 dashboard):** Total Projects ✓, Needs Audit ✓, Critical Findings ✓, Memory Current ✓, Highest Risk Project ✓, Recent Findings ✓.
- **Spec coverage (PRD §26.4 data management):** Export ✓, Import ✓, Clear audit history ✓, Reset app ✓. Search index rebuild deferred (no FTS index yet).
- **Spec coverage (PRD §36 final MVP definition):** install → add project → view dashboard → scan → generate memory → write memory.md → run audit → view findings → copy prompt → resume an old project. All covered.
- **Type consistency:** `UpdateState`, `DashboardSummary`, `BackupExportResult` shared via `@shared/types`. `riskLabelFromScore` (renderer) mirrors `riskLabel` (main) — kept in sync via PRD scoring breakpoints; if scoring breakpoints change, both must update.
- **Risks:**
  - `pnpm package` can be slow on first run because `electron-builder` downloads Electron runtime. Cached afterward.
  - `electron-updater` requires a `publish` config to auto-update; we leave it `null` so the placeholder UI fires real APIs but never resolves. This is intentional per PRD §29.6 ("Auto-update placeholder").
  - Reset App is destructive. The double-confirmation + relaunch + exit pattern matches Electron docs; guard with `window.confirm` AND consider a typed-confirmation prompt in V1.1.
  - Sample `icon.ico` is a placeholder. Replace before public distribution.
- **MVP boundary:** Phase 6 ships the spec's §28.1 + §28.2 ("if time allows") items. `Project chat`, `Git status`, and `Task board` from §28.2 are intentionally deferred to V1.1 since they require new schema or UX surfaces beyond polish.
