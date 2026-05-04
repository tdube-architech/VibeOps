import { ipcRenderer } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { AppInfo } from '@shared/types';

export const api = {
  ping: (): Promise<string> => ipcRenderer.invoke(IpcChannels.ping),
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IpcChannels.appVersion)
};

export type VibeOpsApi = typeof api;
