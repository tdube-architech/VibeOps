import { ipcMain, BrowserWindow } from 'electron';
import path from 'node:path';
import { IpcChannels } from '@shared/ipc-channels';
import type { TerminalService, TerminalSession, TerminalStartArgs } from '@main/terminal/service';

interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export function registerTerminalHandlers(svc: TerminalService): void {
  ipcMain.handle(IpcChannels.terminalStart,
    async (_e, args: TerminalStartArgs): Promise<Result<TerminalSession>> => {
      try { return ok(await svc.start(args)); } catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.terminalWrite,
    (_e, payload: { sessionId: string; data: string }): Result<true> => {
      try { svc.write(payload.sessionId, payload.data); return ok(true); } catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.terminalResize,
    (_e, payload: { sessionId: string; cols: number; rows: number }): Result<true> => {
      try { svc.resize(payload.sessionId, payload.cols, payload.rows); return ok(true); }
      catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.terminalKill, (_e, sessionId: string): Result<true> => {
    try { svc.kill(sessionId); return ok(true); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.terminalList, (): Result<TerminalSession[]> => {
    try { return ok(svc.list()); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.terminalPopout,
    (_e, payload: { projectId: string; cwd: string }): Result<true> => {
      try {
        openPopoutWindow(payload.projectId, payload.cwd);
        return ok(true);
      } catch (e) { return fail(e); }
    }
  );
}

function openPopoutWindow(projectId: string, cwd: string): void {
  const win = new BrowserWindow({
    width: 1024,
    height: 640,
    title: 'VibeOps Terminal',
    backgroundColor: '#0a0a0b',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: false
    }
  });
  // Reuse the renderer dev server / production build, route to the popout view.
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  const target = `#/popout/terminal/${encodeURIComponent(projectId)}?cwd=${encodeURIComponent(cwd)}`;
  if (devUrl) {
    void win.loadURL(devUrl + target);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: target.replace(/^#/, '') });
  }
}
