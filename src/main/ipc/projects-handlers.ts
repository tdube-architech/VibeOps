import { BrowserWindow, dialog, ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type {
  FolderPickResult,
  Project,
  ProjectInput,
  ProjectListQuery,
  ProjectPatch
} from '@shared/types';
import { ProjectsService, DuplicatePathError, InvalidPathError } from '@main/projects/service';

export interface ProjectsContext {
  service: ProjectsService;
  getMainWindow: () => BrowserWindow | null;
}

export interface IpcError {
  code: string;
  message: string;
  meta?: Record<string, unknown>;
}

function toIpcError(err: unknown): IpcError {
  if (err instanceof DuplicatePathError) {
    return { code: err.code, message: err.message, meta: { existing: err.existing } };
  }
  if (err instanceof InvalidPathError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof Error) {
    return { code: 'INTERNAL', message: err.message };
  }
  return { code: 'INTERNAL', message: String(err) };
}

type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = (err: unknown): Result<never> => ({ ok: false, error: toIpcError(err) });

export function registerProjectsHandlers(ctx: ProjectsContext): void {
  ipcMain.handle(IpcChannels.projectsPickFolder, async (): Promise<FolderPickResult> => {
    const win = ctx.getMainWindow();
    const opts = { properties: ['openDirectory' as const, 'createDirectory' as const] };
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, path: null };
    }
    return { canceled: false, path: result.filePaths[0] ?? null };
  });

  ipcMain.handle(IpcChannels.projectsList, (_e, q: ProjectListQuery): Result<Project[]> => {
    try { return ok(ctx.service.list(q ?? {})); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.projectsGet, (_e, id: string): Result<Project | null> => {
    try { return ok(ctx.service.byId(id)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(
    IpcChannels.projectsAdd,
    (_e, payload: { input: ProjectInput; allowDuplicate?: boolean }): Result<Project> => {
      try {
        const opts = payload.allowDuplicate ? { allowDuplicate: true } : {};
        return ok(ctx.service.add(payload.input, opts));
      } catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.projectsUpdate, (_e, patch: ProjectPatch): Result<Project> => {
    try { return ok(ctx.service.update(patch)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.projectsArchive, (_e, id: string): Result<Project> => {
    try { return ok(ctx.service.archive(id)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.projectsUnarchive, (_e, id: string): Result<Project> => {
    try { return ok(ctx.service.unarchive(id)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.projectsRemove, (_e, id: string): Result<true> => {
    try { ctx.service.remove(id); return ok(true); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.projectsCheckPath, (_e, p: string): Result<Project | null> => {
    try { return ok(ctx.service.pathExists(p)); } catch (e) { return fail(e); }
  });
}
