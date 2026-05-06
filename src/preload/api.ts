import { ipcRenderer } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type {
  AppInfo, FolderPickResult, Project, ProjectInput, ProjectListQuery, ProjectPatch,
  Scan, ScanFile, ScanEnvVar,
  Memory, MemoryDraft, MemoryFileStatus, MemoryWriteResult, MemorySource,
  AppSettings, AIProviderId,
  AuditRun, AuditFinding, GeneratedPrompt, AuditType,
  BackupExportResult, DashboardSummary, UpdateState,
  Workspace, WorkspaceInput,
  ChatSession, ChatMessage,
  Task, TaskInput, TaskListQuery, TaskPatch,
  GitStatus, GitInfo,
  AuthState, PersistedSession
} from '@shared/types';
import type { AITestConnectionResult, ProjectAnalysisResult } from '@shared/ai';
import type { ScanProgressEvent } from '@shared/scan-events';
import type { PipelineEvent, AutoPipelineOpts } from '@shared/pipeline-events';
import type { RulePackManifest, RulePackUpdateResult, RulePackUpdateState } from '@shared/rule-pack';

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
    start: (projectId: string, ctx?: { localPath: string; name: string }): Promise<Scan> =>
      unwrap(ipcRenderer.invoke(IpcChannels.scanStart, ctx ? { projectId, ...ctx } : projectId)),
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
    generateDraft: (projectId: string, mode: 'fresh' | 'merge-with-disk' | 'merge-with-version' = 'fresh', version?: number, ctx?: { localPath: string; name: string }): Promise<MemoryDraft> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryGenerateDraft, { projectId, mode, version, ...(ctx ?? {}) })),
    listVersions: (projectId: string): Promise<Memory[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryListVersions, projectId)),
    getLatest: (projectId: string): Promise<Memory | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryGetLatest, projectId)),
    getVersion: (memoryId: string): Promise<Memory | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryGetVersion, memoryId)),
    saveDraft: (projectId: string, content: string, source: MemorySource = 'user-edited'): Promise<Memory> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memorySaveDraft, { projectId, content, source })),
    writeFile: (projectId: string, memoryId: string, ctx?: { localPath: string; name: string }): Promise<MemoryWriteResult> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryWriteFile, { projectId, memoryId, ...(ctx ?? {}) })),
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
    start: (projectId: string, auditType?: AuditType, ctx?: { localPath: string; name: string }): Promise<AuditRun> =>
      unwrap(ipcRenderer.invoke(IpcChannels.auditStart, { projectId, auditType, ...(ctx ?? {}) })),
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
  },
  chat: {
    ensureProjectSession: (projectId: string): Promise<ChatSession> =>
      unwrap(ipcRenderer.invoke(IpcChannels.chatEnsureProjectSession, projectId)),
    history: (sessionId: string): Promise<ChatMessage[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.chatHistory, sessionId)),
    send: (sessionId: string, userText: string): Promise<{ user: ChatMessage; assistant: ChatMessage }> =>
      unwrap(ipcRenderer.invoke(IpcChannels.chatSend, { sessionId, userText }))
  },
  tasks: {
    list: (q: TaskListQuery = {}): Promise<Task[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.taskList, q)),
    get: (id: string): Promise<Task | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.taskGet, id)),
    create: (input: TaskInput): Promise<Task> =>
      unwrap(ipcRenderer.invoke(IpcChannels.taskCreate, input)),
    createFromFinding: (findingId: string): Promise<Task> =>
      unwrap(ipcRenderer.invoke(IpcChannels.taskCreateFromFinding, findingId)),
    update: (patch: TaskPatch): Promise<Task> =>
      unwrap(ipcRenderer.invoke(IpcChannels.taskUpdate, patch)),
    remove: (id: string): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.taskRemove, id))
  },
  pipeline: {
    run: (projectId: string, opts: AutoPipelineOpts = {}, ctx?: { localPath: string; name: string }): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.pipelineRun, { projectId, ...opts, ...(ctx ?? {}) })),
    onProgress: (cb: (e: PipelineEvent) => void): (() => void) => {
      const handler = (_e: unknown, evt: PipelineEvent) => cb(evt);
      ipcRenderer.on(IpcChannels.pipelineProgress, handler);
      return () => ipcRenderer.removeListener(IpcChannels.pipelineProgress, handler);
    }
  },
  projectsExtra: {
    gitStatus: (projectId: string): Promise<GitStatus> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsGitStatus, projectId)),
    gitInfo: (projectId: string): Promise<GitInfo> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsGitInfo, projectId)),
    gitRemoteUrl: (cwd: string): Promise<{ url: string | null }> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsGitRemoteUrl, cwd)),
    gitDefaultBranch: (cwd: string): Promise<{ branch: string | null }> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsGitDefaultBranch, cwd)),
    findClone: (repoUrl: string, candidates: string[]): Promise<{ path: string | null }> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsFindClone, { repoUrl, candidates })),
    defaultCodeRoot: (): Promise<{ root: string }> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsDefaultCodeRoot)),
    cloneStart: (repoUrl: string, targetDir: string): Promise<{ jobId: string }> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsCloneStart, { repoUrl, targetDir })),
    onCloneProgress: (cb: (e: import('@shared/types').CloneProgressEvent) => void): (() => void) => {
      const handler = (_e: unknown, evt: import('@shared/types').CloneProgressEvent) => cb(evt);
      ipcRenderer.on(IpcChannels.projectsCloneProgress, handler);
      return () => ipcRenderer.removeListener(IpcChannels.projectsCloneProgress, handler);
    }
  },
  migrate: {
    status: (): Promise<{ unmigrated: Project[]; alreadyMigrated: number; skippedAt: string | null }> =>
      unwrap(ipcRenderer.invoke(IpcChannels.migrateStatus)),
    mark: (localId: string, serverId: string): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.migrateMark, { localId, serverId })),
    skip: (): Promise<true> => unwrap(ipcRenderer.invoke(IpcChannels.migrateSkip))
  },
  terminal: {
    start: (args: { cwd: string; command?: string; args?: string[]; label?: string; cols?: number; rows?: number }):
      Promise<import('@shared/types').TerminalSession> =>
      unwrap(ipcRenderer.invoke(IpcChannels.terminalStart, args)),
    write: (sessionId: string, data: string): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.terminalWrite, { sessionId, data })),
    resize: (sessionId: string, cols: number, rows: number): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.terminalResize, { sessionId, cols, rows })),
    kill: (sessionId: string): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.terminalKill, sessionId)),
    list: (): Promise<import('@shared/types').TerminalSession[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.terminalList)),
    onData: (cb: (e: { sessionId: string; chunk: string; stream: 'stdout' | 'stderr' }) => void): (() => void) => {
      const handler = (_e: unknown, evt: { sessionId: string; chunk: string; stream: 'stdout' | 'stderr' }) => cb(evt);
      ipcRenderer.on(IpcChannels.terminalData, handler);
      return () => ipcRenderer.removeListener(IpcChannels.terminalData, handler);
    },
    onExit: (cb: (e: { sessionId: string; exitCode: number | null; endedAt: string }) => void): (() => void) => {
      const handler = (_e: unknown, evt: { sessionId: string; exitCode: number | null; endedAt: string }) => cb(evt);
      ipcRenderer.on(IpcChannels.terminalExit, handler);
      return () => ipcRenderer.removeListener(IpcChannels.terminalExit, handler);
    }
  },
  projectActivity: {
    start: (projectId: string, cwd: string): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectActivityStart, { projectId, cwd })),
    stop: (projectId: string): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectActivityStop, projectId)),
    onFileDirty: (cb: (e: import('@shared/types').DirtyFileEvent) => void): (() => void) => {
      const handler = (_e: unknown, evt: import('@shared/types').DirtyFileEvent) => cb(evt);
      ipcRenderer.on(IpcChannels.projectActivityFileDirty, handler);
      return () => ipcRenderer.removeListener(IpcChannels.projectActivityFileDirty, handler);
    },
    onCommit: (cb: (e: import('@shared/types').CommitEvent) => void): (() => void) => {
      const handler = (_e: unknown, evt: import('@shared/types').CommitEvent) => cb(evt);
      ipcRenderer.on(IpcChannels.projectActivityCommit, handler);
      return () => ipcRenderer.removeListener(IpcChannels.projectActivityCommit, handler);
    }
  },
  aiSession: {
    startWatch: (clientLocalId: string, cwd: string): Promise<{ sha: string | null }> =>
      unwrap(ipcRenderer.invoke(IpcChannels.aiSessionStartWatch, { clientLocalId, cwd })),
    stopWatch: (clientLocalId: string): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.aiSessionStopWatch, clientLocalId)),
    gitHead: (cwd: string): Promise<{ sha: string | null }> =>
      unwrap(ipcRenderer.invoke(IpcChannels.aiSessionGitHead, cwd)),
    revertFile: (payload: {
      cwd: string;
      filePath: string;
      diffKind: 'create' | 'modify' | 'delete';
      sha: string | null;
    }): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.aiSessionRevertFile, payload)),
    onDiff: (cb: (e: import('@shared/types').AiSessionDiffEvent) => void): (() => void) => {
      const handler = (_e: unknown, evt: import('@shared/types').AiSessionDiffEvent) => cb(evt);
      ipcRenderer.on(IpcChannels.aiSessionDiff, handler);
      return () => ipcRenderer.removeListener(IpcChannels.aiSessionDiff, handler);
    }
  },
  rulePack: {
    info: (): Promise<RulePackManifest | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.rulePackInfo)),
    state: (): Promise<RulePackUpdateState> =>
      unwrap(ipcRenderer.invoke(IpcChannels.rulePackState)),
    checkUpdate: (): Promise<RulePackUpdateResult> =>
      unwrap(ipcRenderer.invoke(IpcChannels.rulePackCheckUpdate)),
    onState: (cb: (r: RulePackUpdateResult) => void): (() => void) => {
      const handler = (_e: unknown, r: RulePackUpdateResult) => cb(r);
      ipcRenderer.on(IpcChannels.rulePackState, handler);
      return () => ipcRenderer.removeListener(IpcChannels.rulePackState, handler);
    }
  },
  auth: {
    getState: (): Promise<AuthState> => unwrap(ipcRenderer.invoke(IpcChannels.authGetState)),
    getSession: (): Promise<PersistedSession | null> => unwrap(ipcRenderer.invoke(IpcChannels.authGetSession)),
    saveSession: (session: PersistedSession): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.authSaveSession, session)),
    signInGitHub: (): Promise<true> => unwrap(ipcRenderer.invoke(IpcChannels.authSignInGitHub)),
    signOut: (): Promise<true> => unwrap(ipcRenderer.invoke(IpcChannels.authSignOut)),
    openExternal: (url: string): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.authOpenExternal, url)),
    onState: (cb: (s: AuthState) => void): (() => void) => {
      const handler = (_e: unknown, s: AuthState) => cb(s);
      ipcRenderer.on(IpcChannels.authState, handler);
      return () => ipcRenderer.removeListener(IpcChannels.authState, handler);
    },
    onDeepLink: (cb: (url: string) => void): (() => void) => {
      const handler = (_e: unknown, url: string) => cb(url);
      ipcRenderer.on(IpcChannels.authDeepLink, handler);
      return () => ipcRenderer.removeListener(IpcChannels.authDeepLink, handler);
    }
  }
};

export type VibeOpsApi = typeof api;
