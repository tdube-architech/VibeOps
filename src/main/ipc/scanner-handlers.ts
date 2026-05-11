import { spawn as nativeSpawn } from 'node:child_process';
import fs from 'node:fs';
import { BrowserWindow, ipcMain } from 'electron';
import type { Logger } from 'pino';
import { IpcChannels } from '@shared/ipc-channels';
import type { Scan, ScanFile, ScanEnvVar } from '@shared/types';
import { runScan } from '@main/scanner';
import { ProgressEmitter } from '@main/scanner/progress';
import type { ScansRepo } from '@main/scanner/repo';
import type { ProjectsService } from '@main/projects/service';
import { refreshGit, type SpawnFn } from '@main/projects/git-refresh';

export interface ScannerContext {
  scansRepo: ScansRepo;
  projectsService: ProjectsService;
  logger: Logger;
  getMainWindow: () => BrowserWindow | null;
}

export interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false,
  error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

const activeAborts = new Map<string, AbortController>();

const asyncSpawn: SpawnFn = (cmd, args, opts) =>
  new Promise((resolve) => {
    const child = nativeSpawn(cmd, args, { cwd: opts.cwd, env: opts.env, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, opts.timeoutMs);
    child.stdout?.on('data', (b) => { stdout += b.toString(); });
    child.stderr?.on('data', (b) => { stderr += b.toString(); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        status: timedOut ? 124 : (typeof code === 'number' ? code : (signal ? 128 : 1)),
        stdout,
        stderr
      });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ status: 127, stdout: '', stderr: err.message });
    });
  });

export function registerScannerHandlers(ctx: ScannerContext): void {
  ipcMain.handle(IpcChannels.scanStart,
    async (_e, payload: string | { projectId: string; localPath?: string; name?: string }): Promise<Result<Scan>> => {
      try {
        const projectId = typeof payload === 'string' ? payload : payload.projectId;
        if (typeof payload !== 'string' && payload.localPath && payload.name) {
          ctx.projectsService.upsertStub({
            id: payload.projectId,
            name: payload.name,
            localPath: payload.localPath
          });
        }

        // Phase 11: git-refresh for cloud projects with a local checkout.
        const project = ctx.projectsService.byId(projectId);
        const win = ctx.getMainWindow();
        if (project && project.source === 'cloud' && project.localPath) {
          win?.webContents.send(IpcChannels.pipelineProgress, {
            projectId,
            stage: 'git-refresh',
            message: 'Refreshing remote refs…'
          });
          const result = await refreshGit(project.localPath, ctx.logger, {
            spawn: asyncSpawn,
            hasDir: (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
          });
          win?.webContents.send(IpcChannels.pipelineProgress, {
            projectId,
            stage: 'git-refresh',
            message: result.message,
            gitRefresh: {
              attempted: result.attempted,
              fetched: result.fetched,
              pulled: result.pulled,
              dirty: result.dirty,
              ahead: result.ahead,
              behind: result.behind
            }
          });
        }

        const controller = new AbortController();
        const emitter = new ProgressEmitter('', projectId, ctx.getMainWindow);
        const { scan } = await runScan(
          { scansRepo: ctx.scansRepo, projectsService: ctx.projectsService, logger: ctx.logger },
          { projectId, emitter, signal: controller.signal }
        );
        activeAborts.delete(scan.id);
        return ok(scan);
      } catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.scanCancel, (_e, scanId: string): Result<true> => {
    activeAborts.get(scanId)?.abort();
    return ok(true);
  });

  ipcMain.handle(IpcChannels.scanGet, (_e, scanId: string): Result<Scan | null> => {
    try { return ok(ctx.scansRepo.byId(scanId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.scanList, (_e, projectId: string): Result<Scan[]> => {
    try { return ok(ctx.scansRepo.listByProject(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.scanLatest, (_e, projectId: string): Result<Scan | null> => {
    try { return ok(ctx.scansRepo.latestForProject(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.scanFiles, (_e, scanId: string): Result<ScanFile[]> => {
    try { return ok(ctx.scansRepo.filesByScan(scanId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.scanEnvVars, (_e, scanId: string): Result<ScanEnvVar[]> => {
    try { return ok(ctx.scansRepo.envVarsByScan(scanId)); } catch (e) { return fail(e); }
  });
}
