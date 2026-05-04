import { ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { Workspace, WorkspaceInput } from '@shared/types';
import type { WorkspacesService } from '@main/workspaces/service';
import type { SettingsService } from '@main/settings/service';

interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export function registerWorkspaceHandlers(svc: WorkspacesService, settings: SettingsService): void {
  ipcMain.handle(IpcChannels.workspaceList, (): Result<Workspace[]> => {
    try { return ok(svc.list()); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.workspaceCreate, (_e, input: WorkspaceInput): Result<Workspace> => {
    try { return ok(svc.create(input)); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.workspaceRename, (_e, payload: { id: string; name: string }): Result<Workspace> => {
    try { return ok(svc.rename(payload.id, payload.name)); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.workspaceRemove, (_e, id: string): Result<true> => {
    try { svc.remove(id); return ok(true); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.workspaceSetActive, (_e, id: string): Result<true> => {
    try {
      const current = settings.read();
      settings.update({ workspaces: { ...current.workspaces, activeWorkspaceId: id } });
      return ok(true);
    } catch (e) { return fail(e); }
  });
}
