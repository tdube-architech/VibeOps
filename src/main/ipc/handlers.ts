import { app, ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { AppInfo } from '@shared/types';

export function registerCoreHandlers(): void {
  ipcMain.handle(IpcChannels.ping, () => 'pong');
  ipcMain.handle(IpcChannels.appVersion, (): AppInfo => ({
    version: app.getVersion(),
    electronVersion: process.versions.electron,
    platform: process.platform
  }));
}

export { registerProjectsHandlers } from './projects-handlers';
export { registerScannerHandlers } from './scanner-handlers';
export { registerMemoryHandlers } from './memory-handlers';
export { registerSettingsHandlers } from './settings-handlers';
export { registerAIHandlers } from './ai-handlers';
export { registerAuditHandlers } from './audit-handlers';
