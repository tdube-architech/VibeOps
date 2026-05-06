import { ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { ProjectActivityService } from '@main/projects/activity-service';

interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export function registerActivityHandlers(svc: ProjectActivityService): void {
  ipcMain.handle(IpcChannels.projectActivityStart,
    async (_e, payload: { projectId: string; cwd: string }): Promise<Result<true>> => {
      try { await svc.start(payload.projectId, payload.cwd); return ok(true); }
      catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.projectActivityStop,
    (_e, projectId: string): Result<true> => {
      try { svc.stop(projectId); return ok(true); }
      catch (e) { return fail(e); }
    }
  );
}
