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
        recentFindings: recent.slice(0, 500)
      });
    } catch (e) { return fail(e); }
  });
}

export function registerUpdateHandlers(updaterApi: {
  state: () => unknown;
  check: () => Promise<unknown>;
  download: () => Promise<unknown>;
  installAndRestart: () => void;
  openInstallerManually: () => Promise<{ ok: boolean; path: string | null }>;
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
  ipcMain.handle(IpcChannels.updateOpenInstaller, async () => {
    try { return ok(await updaterApi.openInstallerManually()); } catch (e) { return fail(e); }
  });
}
