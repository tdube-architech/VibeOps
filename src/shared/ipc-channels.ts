export const IpcChannels = {
  ping: 'app:ping',
  appVersion: 'app:version',

  projectsList: 'projects:list',
  projectsGet: 'projects:get',
  projectsAdd: 'projects:add',
  projectsUpdate: 'projects:update',
  projectsArchive: 'projects:archive',
  projectsUnarchive: 'projects:unarchive',
  projectsRemove: 'projects:remove',
  projectsPickFolder: 'projects:pickFolder',
  projectsCheckPath: 'projects:checkPath',

  scanStart: 'scan:start',
  scanCancel: 'scan:cancel',
  scanGet: 'scan:get',
  scanList: 'scan:list',
  scanLatest: 'scan:latest',
  scanFiles: 'scan:files',
  scanEnvVars: 'scan:envVars',
  scanProgress: 'scan:progress',

  memoryGenerateDraft: 'memory:generateDraft',
  memoryListVersions: 'memory:listVersions',
  memoryGetVersion: 'memory:getVersion',
  memoryGetLatest: 'memory:getLatest',
  memorySaveDraft: 'memory:saveDraft',
  memoryWriteFile: 'memory:writeFile',
  memoryFileStatus: 'memory:fileStatus',
  memoryReadFile: 'memory:readFile',
  memoryOpenInEditor: 'memory:openInEditor',

  settingsRead: 'settings:read',
  settingsUpdate: 'settings:update',
  settingsSetApiKey: 'settings:setApiKey',
  settingsClearApiKey: 'settings:clearApiKey',

  aiTestConnection: 'ai:testConnection',
  aiGenerateProjectSummary: 'ai:generateProjectSummary',

  auditStart: 'audit:start',
  auditList: 'audit:list',
  auditGet: 'audit:get',
  auditLatest: 'audit:latest',
  auditFindings: 'audit:findings',
  auditUpdateFinding: 'audit:updateFinding',
  promptList: 'prompt:list',
  promptGet: 'prompt:get',
  promptUpdate: 'prompt:update',

  dataExportDb: 'data:exportDb',
  dataImportDb: 'data:importDb',
  dataResetApp: 'data:resetApp',
  dataClearAuditHistory: 'data:clearAuditHistory',
  dataTailLogs: 'data:tailLogs',
  dashboardSummary: 'data:dashboardSummary',

  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateState: 'update:state',

  workspaceList: 'workspace:list',
  workspaceCreate: 'workspace:create',
  workspaceRename: 'workspace:rename',
  workspaceRemove: 'workspace:remove',
  workspaceSetActive: 'workspace:setActive',

  chatEnsureProjectSession: 'chat:ensureProjectSession',
  chatHistory: 'chat:history',
  chatSend: 'chat:send',

  taskList: 'task:list',
  taskGet: 'task:get',
  taskCreate: 'task:create',
  taskCreateFromFinding: 'task:createFromFinding',
  taskUpdate: 'task:update',
  taskRemove: 'task:remove',

  pipelineRun: 'pipeline:run',
  pipelineProgress: 'pipeline:progress',
  projectsGitStatus: 'projects:gitStatus',
  projectsGitInfo: 'projects:gitInfo',

  rulePackInfo: 'rulePack:info',
  rulePackCheckUpdate: 'rulePack:checkUpdate',
  rulePackState: 'rulePack:state',

  terminalStart: 'terminal:start',
  terminalWrite: 'terminal:write',
  terminalResize: 'terminal:resize',
  terminalKill: 'terminal:kill',
  terminalList: 'terminal:list',
  terminalData: 'terminal:data',
  terminalExit: 'terminal:exit',

  aiSessionStartWatch: 'aiSession:startWatch',
  aiSessionStopWatch: 'aiSession:stopWatch',
  aiSessionDiff: 'aiSession:diff',
  aiSessionGitHead: 'aiSession:gitHead',
  aiSessionRevertFile: 'aiSession:revertFile',

  authState: 'auth:state',
  authGetState: 'auth:getState',
  authGetSession: 'auth:getSession',
  authSaveSession: 'auth:saveSession',
  authSignInGitHub: 'auth:signInGitHub',
  authSignOut: 'auth:signOut',
  authDeepLink: 'auth:deepLink',
  authOpenExternal: 'auth:openExternal',

  migrateStatus: 'migrate:status',
  migrateMark: 'migrate:mark',
  migrateSkip: 'migrate:skip'
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

export const IPC_CHANNEL_LIST: readonly IpcChannel[] = Object.values(IpcChannels);
