import { BrowserWindow, ipcMain } from 'electron';
import type { Logger } from 'pino';
import { IpcChannels } from '@shared/ipc-channels';
import type { Scan, ScanFile, ScanEnvVar } from '@shared/types';
import { runScan } from '@main/scanner';
import { ProgressEmitter } from '@main/scanner/progress';
import type { ScansRepo } from '@main/scanner/repo';
import type { ProjectsService } from '@main/projects/service';

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

export function registerScannerHandlers(ctx: ScannerContext): void {
  ipcMain.handle(IpcChannels.scanStart, async (_e, projectId: string): Promise<Result<Scan>> => {
    try {
      const controller = new AbortController();
      const emitter = new ProgressEmitter('', projectId, ctx.getMainWindow);
      const { scan } = await runScan(
        { scansRepo: ctx.scansRepo, projectsService: ctx.projectsService, logger: ctx.logger },
        { projectId, emitter, signal: controller.signal }
      );
      activeAborts.delete(scan.id);
      return ok(scan);
    } catch (e) { return fail(e); }
  });

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
