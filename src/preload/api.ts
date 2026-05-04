import { ipcRenderer } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type {
  AppInfo, FolderPickResult, Project, ProjectInput, ProjectListQuery, ProjectPatch,
  Scan, ScanFile, ScanEnvVar,
  Memory, MemoryDraft, MemoryFileStatus, MemoryWriteResult, MemorySource,
  AppSettings, AIProviderId
} from '@shared/types';
import type { AITestConnectionResult, ProjectAnalysisResult } from '@shared/ai';
import type { ScanProgressEvent } from '@shared/scan-events';

export interface IpcError { code: string; message: string; meta?: Record<string, unknown>; }
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: IpcError };

function unwrap<T>(p: Promise<IpcResult<T>>): Promise<T> {
  return p.then((r) => {
    if (r.ok) return r.value;
    const err = new Error(r.error.message) as Error & { code?: string; meta?: unknown };
    err.code = r.error.code;
    err.meta = r.error.meta;
    throw err;
  });
}

export const api = {
  ping: (): Promise<string> => ipcRenderer.invoke(IpcChannels.ping),
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IpcChannels.appVersion),
  projects: {
    pickFolder: (): Promise<FolderPickResult> => ipcRenderer.invoke(IpcChannels.projectsPickFolder),
    list: (q: ProjectListQuery = {}): Promise<Project[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsList, q)),
    get: (id: string): Promise<Project | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsGet, id)),
    add: (input: ProjectInput, allowDuplicate = false): Promise<Project> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsAdd, { input, allowDuplicate })),
    update: (patch: ProjectPatch): Promise<Project> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsUpdate, patch)),
    archive: (id: string): Promise<Project> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsArchive, id)),
    unarchive: (id: string): Promise<Project> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsUnarchive, id)),
    remove: (id: string): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsRemove, id)),
    checkPath: (p: string): Promise<Project | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsCheckPath, p))
  },
  scans: {
    start: (projectId: string): Promise<Scan> =>
      unwrap(ipcRenderer.invoke(IpcChannels.scanStart, projectId)),
    cancel: (scanId: string): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.scanCancel, scanId)),
    get: (scanId: string): Promise<Scan | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.scanGet, scanId)),
    list: (projectId: string): Promise<Scan[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.scanList, projectId)),
    latest: (projectId: string): Promise<Scan | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.scanLatest, projectId)),
    files: (scanId: string): Promise<ScanFile[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.scanFiles, scanId)),
    envVars: (scanId: string): Promise<ScanEnvVar[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.scanEnvVars, scanId)),
    onProgress: (cb: (e: ScanProgressEvent) => void): (() => void) => {
      const handler = (_e: unknown, evt: ScanProgressEvent) => cb(evt);
      ipcRenderer.on(IpcChannels.scanProgress, handler);
      return () => ipcRenderer.removeListener(IpcChannels.scanProgress, handler);
    }
  },
  memory: {
    generateDraft: (projectId: string, mode: 'fresh' | 'merge-with-disk' | 'merge-with-version' = 'fresh', version?: number): Promise<MemoryDraft> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryGenerateDraft, { projectId, mode, version })),
    listVersions: (projectId: string): Promise<Memory[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryListVersions, projectId)),
    getLatest: (projectId: string): Promise<Memory | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryGetLatest, projectId)),
    getVersion: (memoryId: string): Promise<Memory | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryGetVersion, memoryId)),
    saveDraft: (projectId: string, content: string, source: MemorySource = 'user-edited'): Promise<Memory> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memorySaveDraft, { projectId, content, source })),
    writeFile: (projectId: string, memoryId: string): Promise<MemoryWriteResult> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryWriteFile, { projectId, memoryId })),
    fileStatus: (projectId: string): Promise<MemoryFileStatus> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryFileStatus, projectId)),
    readFile: (projectId: string): Promise<string | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryReadFile, projectId)),
    openInEditor: (projectId: string): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryOpenInEditor, projectId))
  },
  settings: {
    read: (): Promise<AppSettings> => unwrap(ipcRenderer.invoke(IpcChannels.settingsRead)),
    update: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      unwrap(ipcRenderer.invoke(IpcChannels.settingsUpdate, patch)),
    setApiKey: (providerId: AIProviderId, apiKey: string): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.settingsSetApiKey, { providerId, apiKey })),
    clearApiKey: (providerId: AIProviderId): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.settingsClearApiKey, providerId))
  },
  ai: {
    testConnection: (providerId: AIProviderId): Promise<AITestConnectionResult> =>
      unwrap(ipcRenderer.invoke(IpcChannels.aiTestConnection, providerId)),
    generateProjectSummary: (projectId: string): Promise<ProjectAnalysisResult> =>
      unwrap(ipcRenderer.invoke(IpcChannels.aiGenerateProjectSummary, projectId))
  }
};

export type VibeOpsApi = typeof api;
