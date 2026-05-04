import { ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { AppSettings, AIProviderId } from '@shared/types';
import type { SettingsService } from '@main/settings/service';

interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export function registerSettingsHandlers(svc: SettingsService): void {
  ipcMain.handle(IpcChannels.settingsRead, (): Result<AppSettings> => {
    try { return ok(svc.read()); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.settingsUpdate, (_e, patch: Partial<AppSettings>): Result<AppSettings> => {
    try { return ok(svc.update(patch)); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.settingsSetApiKey, (_e, payload: { providerId: AIProviderId; apiKey: string }): Result<true> => {
    try { svc.setApiKey(payload.providerId, payload.apiKey); return ok(true); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.settingsClearApiKey, (_e, providerId: AIProviderId): Result<true> => {
    try { svc.clearApiKey(providerId); return ok(true); } catch (e) { return fail(e); }
  });
}
