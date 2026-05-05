import { ipcMain, shell } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { AuthService, AuthState } from '@main/auth/service';
import type { PersistedSession } from '@main/auth/store';

interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export function registerAuthHandlers(auth: AuthService): void {
  ipcMain.handle(IpcChannels.authGetState, (): Result<AuthState> => {
    try { return ok(auth.getState()); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.authGetSession, (): Result<PersistedSession | null> => {
    try { return ok(auth.getStoredSession()); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.authSaveSession, (_e, session: PersistedSession): Result<true> => {
    try { auth.saveSession(session); return ok(true); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.authSignInGitHub, async (): Promise<Result<true>> => {
    try { await auth.openSignInWithGitHub(); return ok(true); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.authSignOut, (): Result<true> => {
    try { auth.signOut(); return ok(true); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.authOpenExternal, async (_e, url: string): Promise<Result<true>> => {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        throw new Error(`refused to open URL with protocol ${u.protocol}`);
      }
      await shell.openExternal(url);
      return ok(true);
    } catch (e) { return fail(e); }
  });
}
