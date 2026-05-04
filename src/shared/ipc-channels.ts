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
  memoryOpenInEditor: 'memory:openInEditor'
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

export const IPC_CHANNEL_LIST: readonly IpcChannel[] = Object.values(IpcChannels);
