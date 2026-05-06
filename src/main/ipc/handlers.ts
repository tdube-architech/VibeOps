import { app, ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { AppInfo } from '@shared/types';

export function registerCoreHandlers(): void {
  ipcMain.handle(IpcChannels.ping, () => 'pong');
  ipcMain.handle(IpcChannels.appVersion, (): AppInfo => {
    const version = app.getVersion();
    const ts = typeof __BUILD_TIMESTAMP__ === 'string' ? __BUILD_TIMESTAMP__ : '';
    return {
      version,
      buildTimestamp: ts,
      // displayVersion now matches the GitHub Release tag exactly. The build
      // timestamp is shown separately as "Built MMDD HH:mm UTC".
      displayVersion: version,
      electronVersion: process.versions.electron,
      platform: process.platform
    };
  });
}

export { registerProjectsHandlers } from './projects-handlers';
export { registerScannerHandlers } from './scanner-handlers';
export { registerMemoryHandlers } from './memory-handlers';
export { registerSettingsHandlers } from './settings-handlers';
export { registerAIHandlers } from './ai-handlers';
export { registerAuditHandlers } from './audit-handlers';
export { registerDataHandlers, registerUpdateHandlers } from './data-handlers';
export { registerWorkspaceHandlers } from './workspace-handlers';
export { registerChatHandlers } from './chat-handlers';
export { registerTaskHandlers } from './task-handlers';
export { registerPipelineHandlers } from './pipeline-handlers';
export { registerRulePackHandlers } from './rule-pack-handlers';
export { registerAuthHandlers } from './auth-handlers';
export { registerMigrateHandlers } from './migrate-handlers';
export { registerTerminalHandlers } from './terminal-handlers';
export { registerAiSessionHandlers } from './ai-session-handlers';
export { registerActivityHandlers } from './activity-handlers';
