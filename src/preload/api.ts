import { ipcRenderer } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type {
  AppInfo, FolderPickResult, Project, ProjectInput, ProjectListQuery, ProjectPatch,
  Scan, ScanFile, ScanEnvVar,
  Memory, MemoryDraft, MemoryFileStatus, MemoryWriteResult, MemorySource,
  AppSettings, AIProviderId,
  AuditRun, AuditFinding, GeneratedPrompt, AuditType,
  BackupExportResult, DashboardSummary, UpdateState,
  Workspace, WorkspaceInput
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
  },
  audits: {
    start: (projectId: string, auditType?: AuditType): Promise<AuditRun> =>
      unwrap(ipcRenderer.invoke(IpcChannels.auditStart, { projectId, auditType })),
    list: (projectId: string): Promise<AuditRun[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.auditList, projectId)),
    get: (auditId: string): Promise<AuditRun | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.auditGet, auditId)),
    latest: (projectId: string): Promise<AuditRun | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.auditLatest, projectId)),
    findings: (auditRunId: string): Promise<AuditFinding[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.auditFindings, auditRunId)),
    updateFinding: (id: string, status: AuditFinding['status']): Promise<AuditFinding | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.auditUpdateFinding, { id, status }))
  },
  prompts: {
    list: (projectId: string): Promise<GeneratedPrompt[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.promptList, projectId)),
    get: (id: string): Promise<GeneratedPrompt | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.promptGet, id)),
    update: (id: string, patch: { status?: GeneratedPrompt['status']; outcomeNotes?: string | null; usedAt?: string | null }): Promise<GeneratedPrompt | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.promptUpdate, { id, ...patch }))
  },
  data: {
    exportDb: (): Promise<BackupExportResult> => unwrap(ipcRenderer.invoke(IpcChannels.dataExportDb)),
    importDb: (): Promise<BackupExportResult> => unwrap(ipcRenderer.invoke(IpcChannels.dataImportDb)),
    clearAuditHistory: (): Promise<true> => unwrap(ipcRenderer.invoke(IpcChannels.dataClearAuditHistory)),
    resetApp: (): Promise<true> => unwrap(ipcRenderer.invoke(IpcChannels.dataResetApp)),
    tailLogs: (count?: number): Promise<string[]> => unwrap(ipcRenderer.invoke(IpcChannels.dataTailLogs, count ?? 200)),
    dashboardSummary: (): Promise<DashboardSummary> => unwrap(ipcRenderer.invoke(IpcChannels.dashboardSummary))
  },
  update: {
    check: (): Promise<UpdateState> => unwrap(ipcRenderer.invoke(IpcChannels.updateCheck)),
    download: (): Promise<UpdateState> => unwrap(ipcRenderer.invoke(IpcChannels.updateDownload)),
    install: (): Promise<true> => unwrap(ipcRenderer.invoke(IpcChannels.updateInstall)),
    onState: (cb: (s: UpdateState) => void): (() => void) => {
      const handler = (_e: unknown, s: UpdateState) => cb(s);
      ipcRenderer.on(IpcChannels.updateState, handler);
      return () => ipcRenderer.removeListener(IpcChannels.updateState, handler);
    }
  },
  workspaces: {
    list: (): Promise<Workspace[]> => unwrap(ipcRenderer.invoke(IpcChannels.workspaceList)),
    create: (input: WorkspaceInput): Promise<Workspace> => unwrap(ipcRenderer.invoke(IpcChannels.workspaceCreate, input)),
    rename: (id: string, name: string): Promise<Workspace> => unwrap(ipcRenderer.invoke(IpcChannels.workspaceRename, { id, name })),
    remove: (id: string): Promise<true> => unwrap(ipcRenderer.invoke(IpcChannels.workspaceRemove, id)),
    setActive: (id: string): Promise<true> => unwrap(ipcRenderer.invoke(IpcChannels.workspaceSetActive, id))
  }
};

export type VibeOpsApi = typeof api;
