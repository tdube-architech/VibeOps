import { ipcMain, shell } from 'electron';
import path from 'node:path';
import type { Logger } from 'pino';
import { IpcChannels } from '@shared/ipc-channels';
import type { Memory, MemoryDraft, MemoryFileStatus, MemoryWriteResult, MemorySource } from '@shared/types';
import type { MemoryService } from '@main/memory/service';

export interface MemoryContext {
  service: MemoryService;
  logger: Logger;
  resolveProjectPath: (projectId: string) => string | null;
}

export interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export function registerMemoryHandlers(ctx: MemoryContext): void {
  ipcMain.handle(IpcChannels.memoryGenerateDraft,
    async (_e, payload: { projectId: string; mode?: 'fresh' | 'merge-with-disk' | 'merge-with-version'; version?: number }): Promise<Result<MemoryDraft>> => {
      try {
        const opts: { mode?: 'fresh' | 'merge-with-disk' | 'merge-with-version'; mergeFromVersion?: number } = {
          mode: payload.mode ?? 'fresh'
        };
        if (payload.version !== undefined) opts.mergeFromVersion = payload.version;
        const draft = await ctx.service.generateDraft(payload.projectId, opts);
        return ok(draft);
      } catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.memoryListVersions, (_e, projectId: string): Result<Memory[]> => {
    try { return ok(ctx.service.list(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.memoryGetLatest, (_e, projectId: string): Result<Memory | null> => {
    try { return ok(ctx.service.latest(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.memoryGetVersion, (_e, memoryId: string): Result<Memory | null> => {
    try { return ok(ctx.service.byId(memoryId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.memorySaveDraft,
    (_e, payload: { projectId: string; content: string; source: MemorySource }): Result<Memory> => {
      try { return ok(ctx.service.saveDraft(payload.projectId, payload.content, payload.source)); }
      catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.memoryWriteFile,
    async (_e, payload: { projectId: string; memoryId: string }): Promise<Result<MemoryWriteResult>> => {
      try { return ok(await ctx.service.writeFile(payload)); } catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.memoryFileStatus, (_e, projectId: string): Result<MemoryFileStatus> => {
    try { return ok(ctx.service.fileStatus(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.memoryReadFile, (_e, projectId: string): Result<string | null> => {
    try { return ok(ctx.service.readFromDisk(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.memoryOpenInEditor, async (_e, projectId: string): Promise<Result<true>> => {
    try {
      const root = ctx.resolveProjectPath(projectId);
      if (!root) throw new Error('project not found');
      await shell.openPath(path.join(root, 'memory.md'));
      return ok(true);
    } catch (e) { return fail(e); }
  });
}
