import { ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { Task, TaskInput, TaskListQuery, TaskPatch } from '@shared/types';
import type { TasksService } from '@main/tasks/service';

interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export function registerTaskHandlers(svc: TasksService): void {
  ipcMain.handle(IpcChannels.taskList, (_e, q: TaskListQuery): Result<Task[]> => {
    try { return ok(svc.list(q ?? {})); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.taskGet, (_e, id: string): Result<Task | null> => {
    try { return ok(svc.byId(id)); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.taskCreate, (_e, input: TaskInput): Result<Task> => {
    try { return ok(svc.create(input)); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.taskCreateFromFinding, (_e, findingId: string): Result<Task> => {
    try { return ok(svc.createFromFinding(findingId)); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.taskUpdate, (_e, patch: TaskPatch): Result<Task> => {
    try { return ok(svc.update(patch)); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.taskRemove, (_e, id: string): Result<true> => {
    try { svc.remove(id); return ok(true); } catch (e) { return fail(e); }
  });
}
