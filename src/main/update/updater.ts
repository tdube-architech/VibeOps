import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import type { Logger } from 'pino';
import { BrowserWindow, app } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';

export interface UpdaterDeps {
  logger: Logger;
  getMainWindow: () => BrowserWindow | null;
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  latestVersion: string | null;
  message: string | null;
  progressPercent: number | null;
}

const ts = typeof __BUILD_TIMESTAMP__ === 'string' ? __BUILD_TIMESTAMP__ : '';
let state: UpdateState = {
  status: 'idle',
  currentVersion: ts ? `${app.getVersion()}.${ts}` : app.getVersion(),
  latestVersion: null,
  message: null,
  progressPercent: null
};

function emit(deps: UpdaterDeps): void {
  const win = deps.getMainWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(IpcChannels.updateState, state);
}

const STARTUP_CHECK_DELAY_MS = 15_000;
const PERIODIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function setupUpdater(deps: UpdaterDeps): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (m: unknown) => deps.logger.info({ updater: true }, String(m)),
    warn: (m: unknown) => deps.logger.warn({ updater: true }, String(m)),
    error: (m: unknown) => deps.logger.error({ updater: true }, String(m)),
    debug: (m: unknown) => deps.logger.debug({ updater: true }, String(m))
  } as never;

  autoUpdater.on('checking-for-update', () => {
    state = { ...state, status: 'checking', message: 'Checking for update…' };
    emit(deps);
  });
  autoUpdater.on('update-available', (info) => {
    state = { ...state, status: 'available', latestVersion: info.version, message: `Update ${info.version} available.` };
    emit(deps);
  });
  autoUpdater.on('update-not-available', (info) => {
    state = { ...state, status: 'not-available', latestVersion: info.version, message: 'You are on the latest version.' };
    emit(deps);
  });
  autoUpdater.on('error', (err) => {
    state = { ...state, status: 'error', message: err.message };
    emit(deps);
  });
  autoUpdater.on('download-progress', (p) => {
    state = { ...state, status: 'downloading', progressPercent: Math.round(p.percent) };
    emit(deps);
  });
  autoUpdater.on('update-downloaded', (info) => {
    state = { ...state, status: 'downloaded', latestVersion: info.version, message: 'Update downloaded. Restart to install.' };
    emit(deps);
  });

  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        deps.logger.warn({ err: (err as Error).message }, 'auto-update startup check failed');
      });
    }, STARTUP_CHECK_DELAY_MS);

    setInterval(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        deps.logger.warn({ err: (err as Error).message }, 'auto-update periodic check failed');
      });
    }, PERIODIC_CHECK_INTERVAL_MS);
  }
}

export const updaterApi = {
  state: (): UpdateState => state,
  async check(): Promise<UpdateState> {
    try { await autoUpdater.checkForUpdates(); } catch (err) {
      state = { ...state, status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
    return state;
  },
  async download(): Promise<UpdateState> {
    try { await autoUpdater.downloadUpdate(); } catch (err) {
      state = { ...state, status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
    return state;
  },
  installAndRestart(): void {
    autoUpdater.quitAndInstall();
  }
};
