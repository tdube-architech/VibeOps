import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import type { Logger } from 'pino';
import { BrowserWindow, app, shell } from 'electron';
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
  /** Absolute path to the downloaded installer, surfaced for fallback. */
  installerPath: string | null;
}

const ts = typeof __BUILD_TIMESTAMP__ === 'string' ? __BUILD_TIMESTAMP__ : '';
let state: UpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  latestVersion: null,
  message: null,
  progressPercent: null,
  installerPath: null
};

function emit(deps: UpdaterDeps): void {
  const win = deps.getMainWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(IpcChannels.updateState, state);
}

const STARTUP_CHECK_DELAY_MS = 15_000;
const PERIODIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function setupUpdater(deps: UpdaterDeps): void {
  // Auto-download the update as soon as it's detected so the user can
  // click "Install & restart" immediately — no extra "download first" step.
  autoUpdater.autoDownload = true;
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
    const path = (info as unknown as { downloadedFile?: string }).downloadedFile ?? null;
    state = {
      ...state,
      status: 'downloaded',
      latestVersion: info.version,
      installerPath: path,
      message: 'Update downloaded. Click Install & Restart, or open the installer manually if needed.'
    };
    deps.logger.info({ updater: true, version: info.version, installerPath: path }, 'update downloaded');
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
    // (silent=true, forceRunAfter=true) tells the NSIS installer to run
    // with /S and relaunch the app once it's done — no wizard, no "do
    // you want to install" prompt, no manual reopen.
    autoUpdater.quitAndInstall(true, true);
  },
  /**
   * Fallback for cases where silent install doesn't relaunch (most often
   * the first transition between NSIS oneClick modes). Opens the cached
   * installer in a normal window so the user can re-run it manually.
   */
  async openInstallerManually(): Promise<{ ok: boolean; path: string | null }> {
    const path = state.installerPath;
    if (!path) return { ok: false, path: null };
    const err = await shell.openPath(path);
    return { ok: err === '', path };
  }
};
