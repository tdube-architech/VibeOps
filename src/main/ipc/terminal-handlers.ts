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
    (_e, payload: {
      projectId: string;
      cwd: string;
      localTerminalId?: string;
      aiSessionId?: string;
      sessionStartSha?: string | null;
      title?: string;
    }): Result<true> => {
      try {
        openPopoutWindow(payload);
        return ok(true);
      } catch (e) { return fail(e); }
    }
  );
}

interface PopoutArgs {
  projectId: string;
  cwd: string;
  localTerminalId?: string;
  aiSessionId?: string;
  sessionStartSha?: string | null;
  title?: string;
}

function openPopoutWindow(args: PopoutArgs): void {
  const win = new BrowserWindow({
    width: 1024,
    height: 640,
    title: args.title ?? 'VibeOps Terminal',
    backgroundColor: '#0a0a0b',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: false
    }
  });
  const params = new URLSearchParams({ cwd: args.cwd });
  if (args.localTerminalId) params.set('localTerminalId', args.localTerminalId);
  if (args.aiSessionId) params.set('aiSessionId', args.aiSessionId);
  if (args.sessionStartSha) params.set('sessionStartSha', args.sessionStartSha);
  if (args.title) params.set('title', args.title);

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  const hash = `/popout/terminal/${encodeURIComponent(args.projectId)}?${params.toString()}`;
  if (devUrl) {
    void win.loadURL(devUrl + '#' + hash);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash });
  }

  // When the popout window is closed, broadcast the local terminal id so any
  // other window with a hidden cell for this session can un-hide and resume
  // showing the stream.
  win.on('closed', () => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        w.webContents.send(IpcChannels.terminalPopoutClosed, {
          localTerminalId: args.localTerminalId ?? null,
          aiSessionId: args.aiSessionId ?? null
        });
      }
    }
  });
}
